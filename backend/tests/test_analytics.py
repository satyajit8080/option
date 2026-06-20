"""
Unit tests for the pure analytics functions. These don't touch Redis or the
Dhan API — they exercise the math directly against synthetic chains, which
is exactly why the engine was kept side-effect-free.

Run with:  cd backend && pytest
"""
from __future__ import annotations

import pytest

from app.models.schemas import (
    Greeks,
    Instrument,
    RawLeg,
    RawOptionChainData,
    RawOptionChainResponse,
    RawStrikeEntry,
    UnderlyingSegment,
)
from app.services.analytics import (
    build_analytics_bundle,
    compute_max_pain,
    compute_pcr,
    compute_support_resistance,
)
from app.services.chain_builder import build_chain_view, classify_buildup


def make_leg(oi: int, prev_oi: int, ltp: float, prev_close: float, iv: float = 13.0, delta: float = 0.5) -> RawLeg:
    return RawLeg(
        average_price=ltp,
        greeks=Greeks(delta=delta, theta=-10.0, gamma=0.001, vega=8.0),
        implied_volatility=iv,
        last_price=ltp,
        oi=oi,
        previous_close_price=prev_close,
        previous_oi=prev_oi,
        previous_volume=1000,
        security_id=1,
        top_ask_price=ltp + 1,
        top_ask_quantity=10,
        top_bid_price=ltp - 1,
        top_bid_quantity=10,
        volume=50000,
    )


def build_synthetic_chain(spot: float = 24500.0):
    oc: dict[str, RawStrikeEntry] = {}
    for i in range(-5, 6):
        strike = 24500 + i * 50
        # Make 24700 the clear CE wall and 24300 the clear PE wall.
        ce_oi = 300000 if strike == 24700 else 100000
        pe_oi = 320000 if strike == 24300 else 90000
        oc[f"{strike:.6f}"] = RawStrikeEntry(
            ce=make_leg(ce_oi, ce_oi - 5000, 105, 100, iv=13.0, delta=0.5),
            pe=make_leg(pe_oi, pe_oi + 2000, 92, 95, iv=13.8, delta=-0.45),
        )
    raw = RawOptionChainResponse(data=RawOptionChainData(last_price=spot, oc=oc), status="success")
    instrument = Instrument(
        label="NIFTY 50", underlying_scrip=13, underlying_seg=UnderlyingSegment.INDEX, kind="index"
    )
    return build_chain_view(raw, instrument, "2026-06-25")


class TestBuildupClassification:
    def test_long_buildup(self):
        assert classify_buildup(price_change_pct=2.0, oi_change_pct=5.0).value == "long_buildup"

    def test_short_buildup(self):
        assert classify_buildup(price_change_pct=-2.0, oi_change_pct=5.0).value == "short_buildup"

    def test_short_covering(self):
        assert classify_buildup(price_change_pct=2.0, oi_change_pct=-5.0).value == "short_covering"

    def test_long_unwinding(self):
        assert classify_buildup(price_change_pct=-2.0, oi_change_pct=-5.0).value == "long_unwinding"

    def test_neutral_when_flat(self):
        assert classify_buildup(price_change_pct=0.1, oi_change_pct=0.5).value == "neutral"


class TestMaxPain:
    def test_max_pain_is_a_listed_strike(self):
        chain = build_synthetic_chain()
        result = compute_max_pain(chain)
        listed = {r.strike for r in chain.rows}
        assert result.max_pain_strike in listed

    def test_max_pain_curve_covers_all_strikes(self):
        chain = build_synthetic_chain()
        result = compute_max_pain(chain)
        assert len(result.curve) == len(chain.rows)

    def test_distance_sign(self):
        chain = build_synthetic_chain(spot=24500)
        result = compute_max_pain(chain)
        # distance_points = spot - max_pain_strike; sign should be consistent
        assert result.distance_points == pytest.approx(chain.spot_price - result.max_pain_strike, abs=0.01)


class TestPcr:
    def test_pcr_basic_ratio(self):
        chain = build_synthetic_chain()
        result = compute_pcr(chain)
        expected = result.total_pe_oi / result.total_ce_oi
        assert result.overall_pcr == pytest.approx(round(expected, 3), abs=0.001)

    def test_pcr_zone_thresholds(self):
        chain = build_synthetic_chain()
        result = compute_pcr(chain)
        assert result.zone.value in {"bullish", "bearish", "neutral"}


class TestSupportResistance:
    def test_identifies_highest_oi_walls(self):
        chain = build_synthetic_chain()
        result = compute_support_resistance(chain)
        # 24700 was seeded as the dominant CE wall, 24300 as the dominant PE wall
        assert result.resistance_walls[0].strike == 24700
        assert result.support_walls[0].strike == 24300

    def test_wall_status_values_valid(self):
        chain = build_synthetic_chain()
        result = compute_support_resistance(chain)
        valid = {"defended", "under_pressure", "broken"}
        assert all(w.status in valid for w in result.resistance_walls + result.support_walls)


class TestFullBundle:
    def test_bundle_has_all_sections(self):
        chain = build_synthetic_chain()
        bundle = build_analytics_bundle(chain, atm_iv_history=[12, 12.5, 13, 13.5, 14])
        assert bundle.max_pain is not None
        assert bundle.pcr is not None
        assert bundle.support_resistance is not None
        assert bundle.iv is not None
        assert bundle.greeks is not None
        assert bundle.sentiment is not None
        assert isinstance(bundle.unusual_oi, list)

    def test_sentiment_never_contains_trade_advice_words(self):
        """Guard the core product constraint: no buy/sell/enter/exit language."""
        chain = build_synthetic_chain()
        bundle = build_analytics_bundle(chain)
        forbidden = {"buy", "sell", "enter", "exit", "long position", "short position"}
        text = (bundle.sentiment.label.value + " " + bundle.sentiment.disclaimer + " " +
                " ".join(f.observation for f in bundle.sentiment.factors)).lower()
        for word in forbidden:
            assert word not in text, f"Sentiment output unexpectedly contained '{word}'"

    def test_iv_rank_none_without_enough_history(self):
        chain = build_synthetic_chain()
        bundle = build_analytics_bundle(chain, atm_iv_history=[13.0])  # only 1 point
        assert bundle.iv.iv_rank is None
