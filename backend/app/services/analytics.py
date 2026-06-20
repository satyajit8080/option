"""
The analytics engine. Every function here is a pure function of an
`OptionChainView` (+ small amounts of optional history) -> a typed result.
Keeping these pure and side-effect free makes them trivial to unit test.

IMPORTANT (per project constraint): nothing in this module ever emits a
buy/sell/enter/exit instruction. Outputs are always framed as analytical
observations (sentiment labels, distances, zones) — see `compute_sentiment`.
"""
from __future__ import annotations

from app.models.schemas import (
    AnalyticsBundle,
    GreeksAggregate,
    IvAnalysisResult,
    IvSkewPoint,
    MaxPainPoint,
    MaxPainResult,
    OptionChainView,
    PcrResult,
    PcrZone,
    SentimentFactor,
    SentimentLabel,
    SentimentSummary,
    StrikePcr,
    SupportResistanceResult,
    UnusualOiAlert,
    WallLevel,
)

# ---------------------------------------------------------------------------
# Tunable thresholds — centralised here so the whole engine's "personality"
# can be adjusted from one place.
# ---------------------------------------------------------------------------
PCR_BULLISH_THRESHOLD = 1.3
PCR_BEARISH_THRESHOLD = 0.7
WALL_TOP_N = 3
WALL_DEFENDED_BAND_PCT = 0.3  # within this % of spot, a wall is "under pressure"
UNUSUAL_OI_CHANGE_PCT = 50.0  # single-strike OI change vs baseline to flag


# ---------------------------------------------------------------------------
# Max Pain
# ---------------------------------------------------------------------------

def compute_max_pain(chain: OptionChainView) -> MaxPainResult:
    strikes = [r.strike for r in chain.rows]
    ce_oi = {r.strike: (r.ce.oi if r.ce else 0) for r in chain.rows}
    pe_oi = {r.strike: (r.pe.oi if r.pe else 0) for r in chain.rows}

    curve: list[MaxPainPoint] = []
    best_strike = strikes[0] if strikes else 0.0
    best_pain = float("inf")

    for candidate in strikes:
        # Total monetary value option WRITERS would owe if the underlying
        # settled exactly at `candidate` on expiry day.
        total_pain = 0.0
        for k in strikes:
            if candidate > k:
                total_pain += ce_oi[k] * (candidate - k)  # ITM calls
            if candidate < k:
                total_pain += pe_oi[k] * (k - candidate)  # ITM puts
        curve.append(MaxPainPoint(strike=candidate, total_pain=total_pain))
        if total_pain < best_pain:
            best_pain = total_pain
            best_strike = candidate

    distance = chain.spot_price - best_strike
    distance_pct = (distance / best_strike * 100.0) if best_strike else 0.0

    return MaxPainResult(
        max_pain_strike=best_strike,
        spot_price=chain.spot_price,
        distance_points=round(distance, 2),
        distance_pct=round(distance_pct, 2),
        curve=curve,
    )


# ---------------------------------------------------------------------------
# PCR
# ---------------------------------------------------------------------------

def compute_pcr(chain: OptionChainView) -> PcrResult:
    total_ce = sum(r.ce.oi for r in chain.rows if r.ce)
    total_pe = sum(r.pe.oi for r in chain.rows if r.pe)
    overall = (total_pe / total_ce) if total_ce else 0.0

    if overall >= PCR_BULLISH_THRESHOLD:
        zone = PcrZone.BULLISH
    elif overall <= PCR_BEARISH_THRESHOLD:
        zone = PcrZone.BEARISH
    else:
        zone = PcrZone.NEUTRAL

    strike_wise = [
        StrikePcr(
            strike=r.strike,
            pcr=round((r.pe.oi / r.ce.oi), 2) if (r.ce and r.ce.oi and r.pe) else 0.0,
        )
        for r in chain.rows
    ]

    return PcrResult(
        overall_pcr=round(overall, 3),
        zone=zone,
        total_ce_oi=total_ce,
        total_pe_oi=total_pe,
        strike_wise=strike_wise,
    )


# ---------------------------------------------------------------------------
# Support / Resistance (OI walls)
# ---------------------------------------------------------------------------

def _wall_status(strike: float, spot: float, side: str) -> str:
    """side: 'resistance' (CE wall, above which writers are defending) or
    'support' (PE wall, below which writers are defending)."""
    distance_pct = abs(spot - strike) / strike * 100.0 if strike else 0.0

    if side == "resistance":
        if spot > strike:
            return "broken"
        if distance_pct <= WALL_DEFENDED_BAND_PCT:
            return "under_pressure"
        return "defended"
    else:  # support
        if spot < strike:
            return "broken"
        if distance_pct <= WALL_DEFENDED_BAND_PCT:
            return "under_pressure"
        return "defended"


def compute_support_resistance(chain: OptionChainView) -> SupportResistanceResult:
    ce_rows = [(r.strike, r.ce.oi) for r in chain.rows if r.ce]
    pe_rows = [(r.strike, r.pe.oi) for r in chain.rows if r.pe]

    top_ce = sorted(ce_rows, key=lambda x: x[1], reverse=True)[:WALL_TOP_N]
    top_pe = sorted(pe_rows, key=lambda x: x[1], reverse=True)[:WALL_TOP_N]

    resistance_walls = [
        WallLevel(
            strike=strike,
            oi=oi,
            distance_pct=round((strike - chain.spot_price) / chain.spot_price * 100.0, 2) if chain.spot_price else 0.0,
            status=_wall_status(strike, chain.spot_price, "resistance"),
        )
        for strike, oi in top_ce
    ]
    support_walls = [
        WallLevel(
            strike=strike,
            oi=oi,
            distance_pct=round((chain.spot_price - strike) / chain.spot_price * 100.0, 2) if chain.spot_price else 0.0,
            status=_wall_status(strike, chain.spot_price, "support"),
        )
        for strike, oi in top_pe
    ]

    return SupportResistanceResult(resistance_walls=resistance_walls, support_walls=support_walls)


# ---------------------------------------------------------------------------
# IV analysis
# ---------------------------------------------------------------------------

def compute_iv_analysis(chain: OptionChainView, atm_iv_history: list[float] | None = None) -> IvAnalysisResult:
    atm_row = next((r for r in chain.rows if r.is_atm), None)
    ce_iv = atm_row.ce.iv if atm_row and atm_row.ce else 0.0
    pe_iv = atm_row.pe.iv if atm_row and atm_row.pe else 0.0
    atm_iv = round((ce_iv + pe_iv) / 2.0, 2) if (ce_iv or pe_iv) else 0.0

    iv_rank = None
    iv_percentile = None
    if atm_iv_history and len(atm_iv_history) >= 5:
        lo, hi = min(atm_iv_history), max(atm_iv_history)
        if hi > lo:
            iv_rank = round((atm_iv - lo) / (hi - lo) * 100.0, 1)
        below = sum(1 for v in atm_iv_history if v <= atm_iv)
        iv_percentile = round(below / len(atm_iv_history) * 100.0, 1)

    skew = [
        IvSkewPoint(
            strike=r.strike,
            ce_iv=r.ce.iv if r.ce else None,
            pe_iv=r.pe.iv if r.pe else None,
        )
        for r in chain.rows
    ]

    return IvAnalysisResult(atm_iv=atm_iv, iv_rank=iv_rank, iv_percentile=iv_percentile, skew=skew)


# ---------------------------------------------------------------------------
# Greeks aggregate
# ---------------------------------------------------------------------------

def compute_greeks_aggregate(chain: OptionChainView) -> GreeksAggregate:
    total_ce_delta = sum(r.ce.delta * r.ce.oi for r in chain.rows if r.ce)
    total_pe_delta = sum(r.pe.delta * r.pe.oi for r in chain.rows if r.pe)
    net_delta = total_ce_delta + total_pe_delta

    total_gamma = sum((r.ce.gamma * r.ce.oi if r.ce else 0) + (r.pe.gamma * r.pe.oi if r.pe else 0) for r in chain.rows)
    total_theta = sum((r.ce.theta * r.ce.oi if r.ce else 0) + (r.pe.theta * r.pe.oi if r.pe else 0) for r in chain.rows)
    total_vega = sum((r.ce.vega * r.ce.oi if r.ce else 0) + (r.pe.vega * r.pe.oi if r.pe else 0) for r in chain.rows)

    # NOTE on `market_maker_bias`: OI alone does not tell us who is net long
    # vs short a contract, so this is a rough proxy rather than a verified
    # positioning read — we treat heavy gamma concentration tightly clustered
    # around the ATM strike (where dealer hedging flow is typically most
    # active) as the "short_gamma"-leaning case, since that is the regime
    # where dealer delta-hedging tends to amplify intraday moves.
    atm_gamma_share = 0.0
    total_oi = sum((r.ce.oi if r.ce else 0) + (r.pe.oi if r.pe else 0) for r in chain.rows)
    if total_oi:
        near_atm_oi = sum(
            (r.ce.oi if r.ce else 0) + (r.pe.oi if r.pe else 0)
            for r in chain.rows
            if abs(r.strike - chain.atm_strike) / chain.atm_strike <= 0.01
        ) if chain.atm_strike else 0
        atm_gamma_share = near_atm_oi / total_oi

    if atm_gamma_share >= 0.35:
        bias = "short_gamma"
    elif atm_gamma_share <= 0.15:
        bias = "long_gamma"
    else:
        bias = "neutral"

    return GreeksAggregate(
        net_delta=round(net_delta, 2),
        total_ce_delta=round(total_ce_delta, 2),
        total_pe_delta=round(total_pe_delta, 2),
        total_gamma=round(total_gamma, 4),
        total_theta=round(total_theta, 2),
        total_vega=round(total_vega, 2),
        market_maker_bias=bias,
    )


# ---------------------------------------------------------------------------
# Unusual OI alerts
# ---------------------------------------------------------------------------

def detect_unusual_oi(chain: OptionChainView, threshold_pct: float = UNUSUAL_OI_CHANGE_PCT) -> list[UnusualOiAlert]:
    alerts: list[UnusualOiAlert] = []
    for r in chain.rows:
        if r.ce and abs(r.ce.oi_change_pct) >= threshold_pct:
            alerts.append(
                UnusualOiAlert(
                    strike=r.strike,
                    side="CE",
                    oi_change_pct=r.ce.oi_change_pct,
                    message=f"CE OI at {r.strike:g} moved {r.ce.oi_change_pct:+.1f}% vs baseline",
                )
            )
        if r.pe and abs(r.pe.oi_change_pct) >= threshold_pct:
            alerts.append(
                UnusualOiAlert(
                    strike=r.strike,
                    side="PE",
                    oi_change_pct=r.pe.oi_change_pct,
                    message=f"PE OI at {r.strike:g} moved {r.pe.oi_change_pct:+.1f}% vs baseline",
                )
            )
    alerts.sort(key=lambda a: abs(a.oi_change_pct), reverse=True)
    return alerts[:10]


# ---------------------------------------------------------------------------
# Sentiment summary — combines every signal above into one analytical label.
# Strictly observational language only; see SentimentSummary.disclaimer.
# ---------------------------------------------------------------------------

def compute_sentiment(
    chain: OptionChainView,
    max_pain: MaxPainResult,
    pcr: PcrResult,
    sr: SupportResistanceResult,
    iv: IvAnalysisResult,
) -> SentimentSummary:
    factors: list[SentimentFactor] = []
    score = 0.0

    # --- PCR factor ---
    if pcr.zone == PcrZone.BULLISH:
        factors.append(SentimentFactor(
            name="Put-Call Ratio",
            observation=f"Overall PCR at {pcr.overall_pcr} indicates heavier put writing than call writing.",
            leaning=SentimentLabel.BULLISH,
        ))
        score += 1
    elif pcr.zone == PcrZone.BEARISH:
        factors.append(SentimentFactor(
            name="Put-Call Ratio",
            observation=f"Overall PCR at {pcr.overall_pcr} indicates heavier call writing than put writing.",
            leaning=SentimentLabel.BEARISH,
        ))
        score -= 1
    else:
        factors.append(SentimentFactor(
            name="Put-Call Ratio",
            observation=f"Overall PCR at {pcr.overall_pcr} sits in a neutral band.",
            leaning=SentimentLabel.NEUTRAL,
        ))

    # --- Max Pain factor (mean-reversion read: spot tends to gravitate
    #     toward max pain into expiry) ---
    if max_pain.distance_pct > 0.3:
        factors.append(SentimentFactor(
            name="Max Pain",
            observation=f"Spot is trading {max_pain.distance_pct:+.2f}% above Max Pain ({max_pain.max_pain_strike:g}).",
            leaning=SentimentLabel.BEARISH,
        ))
        score -= 1
    elif max_pain.distance_pct < -0.3:
        factors.append(SentimentFactor(
            name="Max Pain",
            observation=f"Spot is trading {max_pain.distance_pct:+.2f}% below Max Pain ({max_pain.max_pain_strike:g}).",
            leaning=SentimentLabel.BULLISH,
        ))
        score += 1
    else:
        factors.append(SentimentFactor(
            name="Max Pain",
            observation=f"Spot is trading close to Max Pain ({max_pain.max_pain_strike:g}).",
            leaning=SentimentLabel.NEUTRAL,
        ))

    # --- OI wall factor ---
    broken_resistance = any(w.status == "broken" for w in sr.resistance_walls)
    broken_support = any(w.status == "broken" for w in sr.support_walls)
    if broken_resistance and not broken_support:
        factors.append(SentimentFactor(
            name="OI Walls",
            observation="Spot has moved through a high-OI call resistance wall.",
            leaning=SentimentLabel.BULLISH,
        ))
        score += 1
    elif broken_support and not broken_resistance:
        factors.append(SentimentFactor(
            name="OI Walls",
            observation="Spot has moved through a high-OI put support wall.",
            leaning=SentimentLabel.BEARISH,
        ))
        score -= 1
    else:
        factors.append(SentimentFactor(
            name="OI Walls",
            observation="Spot remains contained between the nearest CE resistance and PE support walls.",
            leaning=SentimentLabel.NEUTRAL,
        ))

    # --- IV skew factor (put IV richer than call IV -> downside hedging demand) ---
    atm_row = next((r for r in chain.rows if r.is_atm), None)
    if atm_row and atm_row.ce and atm_row.pe and atm_row.ce.iv and atm_row.pe.iv:
        iv_diff_pct = (atm_row.pe.iv - atm_row.ce.iv) / atm_row.ce.iv * 100.0
        if iv_diff_pct > 5:
            factors.append(SentimentFactor(
                name="IV Skew",
                observation="ATM put IV is richer than call IV, consistent with downside hedging demand.",
                leaning=SentimentLabel.BEARISH,
            ))
            score -= 0.5
        elif iv_diff_pct < -5:
            factors.append(SentimentFactor(
                name="IV Skew",
                observation="ATM call IV is richer than put IV, consistent with upside speculative demand.",
                leaning=SentimentLabel.BULLISH,
            ))
            score += 0.5
        else:
            factors.append(SentimentFactor(
                name="IV Skew",
                observation="ATM call and put IV are roughly balanced.",
                leaning=SentimentLabel.NEUTRAL,
            ))

    leanings = [f.leaning for f in factors]
    has_bullish = SentimentLabel.BULLISH in leanings
    has_bearish = SentimentLabel.BEARISH in leanings

    if score >= 1.5:
        label = SentimentLabel.BULLISH
    elif score <= -1.5:
        label = SentimentLabel.BEARISH
    elif has_bullish and has_bearish:
        label = SentimentLabel.SIDEWAYS
    else:
        label = SentimentLabel.NEUTRAL

    confidence = min(abs(score) / max(len(factors), 1), 1.0)

    return SentimentSummary(label=label, confidence=round(confidence, 2), factors=factors)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def build_analytics_bundle(chain: OptionChainView, atm_iv_history: list[float] | None = None) -> AnalyticsBundle:
    max_pain = compute_max_pain(chain)
    pcr = compute_pcr(chain)
    sr = compute_support_resistance(chain)
    iv = compute_iv_analysis(chain, atm_iv_history)
    greeks = compute_greeks_aggregate(chain)
    unusual_oi = detect_unusual_oi(chain)
    sentiment = compute_sentiment(chain, max_pain, pcr, sr, iv)

    return AnalyticsBundle(
        max_pain=max_pain,
        pcr=pcr,
        support_resistance=sr,
        iv=iv,
        greeks=greeks,
        sentiment=sentiment,
        unusual_oi=unusual_oi,
    )
