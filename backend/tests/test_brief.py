"""
Unit tests for the AI brief safety guard and parsing. The guard is the
critical safety control: it must reject any LLM output containing trade-advice
language so a bad generation can never surface as a tip.
"""
from __future__ import annotations

import pytest

from app.services.brief import _guard_output, _parse_llm_json, _materially_changed, _signature


class TestGuard:
    def test_rejects_buy(self):
        with pytest.raises(ValueError):
            _guard_output("headline", ["You should buy 24500 calls"])

    def test_rejects_sell(self):
        with pytest.raises(ValueError):
            _guard_output("Sell puts now", ["clean point"])

    def test_rejects_enter_exit(self):
        with pytest.raises(ValueError):
            _guard_output("Good entry point", ["enter here and exit at target"])

    def test_rejects_stoploss_target(self):
        with pytest.raises(ValueError):
            _guard_output("levels", ["keep a stoploss at 24400 with target 24700"])

    def test_rejects_recommendation_phrasing(self):
        with pytest.raises(ValueError):
            _guard_output("View", ["I recommend a bullish position"])

    def test_passes_clean_observational(self):
        h, p = _guard_output(
            "Options data leans mildly bearish",
            ["PCR at 0.78 leans bearish", "Spot holds above the 24,300 put wall", "Max Pain sits at 24,400"],
        )
        assert h == "Options data leans mildly bearish"
        assert len(p) == 3

    def test_trims_to_five_points(self):
        _, p = _guard_output("h", [f"observation {i}" for i in range(10)])
        assert len(p) == 5


class TestParse:
    def test_parses_plain_json(self):
        h, p = _parse_llm_json('{"headline":"X","points":["a","b"]}')
        assert h == "X" and p == ["a", "b"]

    def test_parses_fenced_json(self):
        h, p = _parse_llm_json('```json\n{"headline":"X","points":["a"]}\n```')
        assert h == "X" and p == ["a"]

    def test_rejects_empty(self):
        with pytest.raises(ValueError):
            _parse_llm_json('{"headline":"","points":[]}')


class TestMaterialChange:
    def _sig(self, **overrides):
        base = {
            "spot_bucket": 24500, "pcr_bucket": 0.8, "zone": "bearish", "max_pain": 24400,
            "sentiment": "bearish", "res_broken": False, "sup_broken": False,
            "top_res": 24700, "top_sup": 24300,
        }
        base.update(overrides)
        return base

    def test_first_time_always_changed(self):
        assert _materially_changed(None, self._sig()) is True

    def test_identical_not_changed(self):
        assert _materially_changed(self._sig(), self._sig()) is False

    def test_max_pain_move_is_material(self):
        assert _materially_changed(self._sig(), self._sig(max_pain=24500)) is True

    def test_wall_break_is_material(self):
        assert _materially_changed(self._sig(), self._sig(res_broken=True)) is True
