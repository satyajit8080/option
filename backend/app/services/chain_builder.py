"""
Transforms a raw `RawOptionChainResponse` (Dhan's exact wire format) into our
processed `OptionChainView` — computing OI change, % change, ATM strike and
per-leg OI-buildup classification along the way.

OI-buildup classification (the standard NSE-trader quadrant) compares the
option contract's own LTP change against its own OI change:

                    OI ↑                  OI ↓
   Price ↑     Long Buildup          Short Covering
   Price ↓     Short Buildup         Long Unwinding

Baseline for the "change" comparison:
  - By default we diff against `previous_oi` / `previous_close_price`, which
    Dhan populates with the **prior trading session's** values — this gives
    day-over-day buildup ("today's OI vs yesterday's OI", as required).
  - If an intraday `baseline_oi` snapshot (strike -> {ce, pe} OI captured
    earlier today, e.g. from `services.cache`) is supplied, OI change is
    computed against *that* instead, giving true intraday buildup
    ("OI at 9:30 vs now"). Price-change is still computed against
    `previous_close_price` either way, since Dhan's option-chain payload
    does not include today's per-leg opening price.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.models.schemas import (
    Instrument,
    OiBuildup,
    OptionChainView,
    OptionLegView,
    RawLeg,
    RawOptionChainResponse,
    StrikeRow,
)

# Thresholds (in %) below which a price/OI move is treated as "flat" rather
# than a directional ↑/↓ for buildup classification. Tunable.
PRICE_FLAT_THRESHOLD_PCT = 0.5
OI_FLAT_THRESHOLD_PCT = 2.0


def _pct_change(curr: float, prev: float) -> float:
    if prev == 0:
        return 0.0
    return ((curr - prev) / prev) * 100.0


def classify_buildup(price_change_pct: float, oi_change_pct: float) -> OiBuildup:
    price_up = price_change_pct > PRICE_FLAT_THRESHOLD_PCT
    price_down = price_change_pct < -PRICE_FLAT_THRESHOLD_PCT
    oi_up = oi_change_pct > OI_FLAT_THRESHOLD_PCT
    oi_down = oi_change_pct < -OI_FLAT_THRESHOLD_PCT

    if price_up and oi_up:
        return OiBuildup.LONG_BUILDUP
    if price_down and oi_up:
        return OiBuildup.SHORT_BUILDUP
    if price_down and oi_down:
        return OiBuildup.LONG_UNWINDING
    if price_up and oi_down:
        return OiBuildup.SHORT_COVERING
    return OiBuildup.NEUTRAL


def _build_leg_view(leg: RawLeg, baseline_oi: int | None) -> OptionLegView:
    prev_oi = baseline_oi if baseline_oi is not None else leg.previous_oi
    oi_change = leg.oi - prev_oi
    oi_change_pct = _pct_change(leg.oi, prev_oi)
    price_change_pct = _pct_change(leg.last_price, leg.previous_close_price)

    return OptionLegView(
        ltp=leg.last_price,
        oi=leg.oi,
        oi_change=oi_change,
        oi_change_pct=round(oi_change_pct, 2),
        volume=leg.volume,
        iv=round(leg.implied_volatility, 2),
        delta=leg.greeks.delta,
        gamma=leg.greeks.gamma,
        theta=leg.greeks.theta,
        vega=leg.greeks.vega,
        bid=leg.top_bid_price,
        ask=leg.top_ask_price,
        buildup=classify_buildup(price_change_pct, oi_change_pct),
    )


def _nearest_strike(strikes: list[float], spot: float) -> float:
    return min(strikes, key=lambda s: abs(s - spot))


def build_chain_view(
    raw: RawOptionChainResponse,
    instrument: Instrument,
    expiry: str,
    baseline_oi: dict[str, dict[str, int]] | None = None,
) -> OptionChainView:
    spot = raw.data.last_price
    strikes = sorted(float(s) for s in raw.data.oc.keys())
    atm_strike = _nearest_strike(strikes, spot) if strikes else 0.0

    rows: list[StrikeRow] = []
    for strike in strikes:
        # Dhan's keys are strings like "25650.000000" — rebuild the lookup key
        # defensively rather than assuming exact float formatting.
        raw_key = next(k for k in raw.data.oc.keys() if float(k) == strike)
        entry = raw.data.oc[raw_key]

        strike_baseline = (baseline_oi or {}).get(raw_key) or (baseline_oi or {}).get(str(strike))

        ce_view = (
            _build_leg_view(entry.ce, (strike_baseline or {}).get("ce") if strike_baseline else None)
            if entry.ce
            else None
        )
        pe_view = (
            _build_leg_view(entry.pe, (strike_baseline or {}).get("pe") if strike_baseline else None)
            if entry.pe
            else None
        )

        rows.append(
            StrikeRow(
                strike=strike,
                is_atm=(strike == atm_strike),
                ce=ce_view,
                pe=pe_view,
            )
        )

    return OptionChainView(
        underlying_label=instrument.label,
        underlying_scrip=instrument.underlying_scrip,
        expiry=expiry,
        spot_price=spot,
        atm_strike=atm_strike,
        fetched_at=datetime.now(timezone.utc).isoformat(),
        rows=rows,
    )
