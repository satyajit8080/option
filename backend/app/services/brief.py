"""
AI market brief service.

Generates a short, plain-language, *observational* summary of what the
options data currently shows, via OpenRouter. Three things make this safe
and cheap:

1. **Shared cache** — one brief per (underlying, expiry) is cached in Redis
   and served to every user. 1 or 1,000 viewers => the same single LLM call.

2. **"As market changes" regeneration** — we only call the LLM again when the
   underlying data has *materially* moved (spot crosses a wall, PCR shifts,
   Max Pain moves, a wall breaks), subject to a floor (never more often than
   brief_min_seconds_between_calls) and a ceiling (force refresh after
   brief_max_staleness_seconds even if quiet). A quiet market costs nothing.

3. **No-advice guard** — the system prompt forbids buy/sell/enter/exit
   language, and `_guard_output` re-checks the model's text and rejects it
   if anything slips through, so a bad generation can never become a tip.

If `openrouter_api_key` is unset, every call returns BriefUnavailable and
nothing else in the app is affected.
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.models.schemas import (
    BriefUnavailable,
    FullChainResponse,
    MarketBrief,
)
from app.services.cache import get_redis

logger = logging.getLogger("brief")

# Phrases that would turn an observation into trade advice. If the model
# emits any of these we reject the output rather than show it.
_FORBIDDEN = re.compile(
    r"\b(buy|sell|enter|exit|long position|short position|go long|go short|"
    r"book profit|stop ?loss|target price|add position|square off|"
    r"i recommend|you should (buy|sell|trade)|take a trade)\b",
    re.IGNORECASE,
)


def _brief_key(scrip: int, expiry: str) -> str:
    return f"ai_brief:{scrip}:{expiry}"


def _signature(data: FullChainResponse) -> dict:
    """A compact fingerprint of the market state. Regeneration is triggered
    when this changes 'materially' vs the cached brief's signature."""
    a = data.analytics
    return {
        "spot_bucket": round(data.chain.spot_price / 25) * 25,  # 25-pt buckets
        "pcr_bucket": round(a.pcr.overall_pcr, 1),
        "zone": a.pcr.zone.value,
        "max_pain": a.max_pain.max_pain_strike,
        "sentiment": a.sentiment.label.value,
        "res_broken": any(w.status == "broken" for w in a.support_resistance.resistance_walls),
        "sup_broken": any(w.status == "broken" for w in a.support_resistance.support_walls),
        "top_res": a.support_resistance.resistance_walls[0].strike if a.support_resistance.resistance_walls else None,
        "top_sup": a.support_resistance.support_walls[0].strike if a.support_resistance.support_walls else None,
    }


def _materially_changed(old_sig: dict | None, new_sig: dict) -> bool:
    if old_sig is None:
        return True
    # Any change in these discrete fields counts as material.
    return old_sig != new_sig


def _compact_data_for_llm(data: FullChainResponse) -> dict:
    """The small, structured snapshot we hand the LLM. We deliberately send
    *derived analytics*, not the raw 100-strike chain — cheaper tokens and it
    keeps the model focused on the signals we've already computed."""
    a = data.analytics
    return {
        "underlying": data.chain.underlying_label,
        "expiry": data.chain.expiry,
        "spot_price": round(data.chain.spot_price, 2),
        "atm_strike": data.chain.atm_strike,
        "pcr": a.pcr.overall_pcr,
        "pcr_zone": a.pcr.zone.value,
        "max_pain_strike": a.max_pain.max_pain_strike,
        "max_pain_distance_pts": a.max_pain.distance_points,
        "atm_iv": a.iv.atm_iv,
        "iv_rank": a.iv.iv_rank,
        "resistance_walls": [
            {"strike": w.strike, "status": w.status} for w in a.support_resistance.resistance_walls[:3]
        ],
        "support_walls": [
            {"strike": w.strike, "status": w.status} for w in a.support_resistance.support_walls[:3]
        ],
        "net_delta": a.greeks.net_delta,
        "rule_based_sentiment": a.sentiment.label.value,
        "unusual_oi": [
            {"strike": u.strike, "side": u.side, "oi_change_pct": u.oi_change_pct} for u in a.unusual_oi[:4]
        ],
    }


_SYSTEM_PROMPT = """You are a markets data analyst writing a brief for an Indian options analytics dashboard (NSE/BSE).

You will receive a JSON snapshot of computed option-chain analytics (PCR, Max Pain, OI walls, IV, Greeks, sentiment). Write a SHORT, skimmable, OBSERVATIONAL brief of what the data shows.

HARD RULES — these are absolute:
- NEVER give trade advice. Do not say buy, sell, enter, exit, go long/short, book profit, stop-loss, target, or recommend any trade or position.
- Only describe what the data shows as analytical observations (e.g. "PCR at 0.78 leans bearish", "spot is holding above the 24,300 put wall").
- You are NOT a SEBI-registered adviser. Frame everything as observation, never as a recommendation.
- Be factual and grounded ONLY in the numbers provided. Do not invent levels or data.

STYLE:
- Output STRICT JSON: {"headline": "...", "points": ["...", "...", ...]}
- "headline": one short line (max ~12 words) capturing the overall data lean.
- "points": 3 to 5 bullet points, each ONE short sentence (max ~16 words). Fast to read.
- Plain English a retail trader understands. No fluff, no preamble, no disclaimer (the app adds one).
- Do not wrap the JSON in markdown fences."""


class BriefService:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=20.0)

    async def get_brief(self, data: FullChainResponse) -> MarketBrief | BriefUnavailable:
        if not settings.openrouter_api_key:
            return BriefUnavailable(reason="AI brief not configured (set OPENROUTER_API_KEY).")

        scrip = data.chain.underlying_scrip
        expiry = data.chain.expiry
        key = _brief_key(scrip, expiry)
        r = get_redis()

        cached_raw = await r.get(key)
        cached = json.loads(cached_raw) if cached_raw else None
        now = time.time()

        if cached:
            age = now - cached["ts"]
            last_sig = cached.get("signature")
            new_sig = _signature(data)

            within_floor = age < settings.brief_min_seconds_between_calls
            past_ceiling = age > settings.brief_max_staleness_seconds
            changed = _materially_changed(last_sig, new_sig)

            # Serve cache unless: (material change AND past the floor) OR past the ceiling.
            if within_floor or (not changed and not past_ceiling):
                brief = MarketBrief.model_validate(cached["brief"])
                brief.is_stale = age > settings.brief_max_staleness_seconds
                return brief

        # (Re)generate.
        try:
            brief = await self._generate(data)
        except Exception as exc:
            logger.warning("Brief generation failed for %s/%s: %s", scrip, expiry, exc)
            if cached:
                stale = MarketBrief.model_validate(cached["brief"])
                stale.is_stale = True
                return stale
            return BriefUnavailable(reason=f"Could not generate brief: {exc}")

        await r.set(
            key,
            json.dumps({"ts": now, "signature": _signature(data), "brief": brief.model_dump(mode="json")}),
            ex=settings.brief_max_staleness_seconds * 2,
        )
        return brief

    async def _generate(self, data: FullChainResponse) -> MarketBrief:
        payload = _compact_data_for_llm(data)
        body = {
            "model": settings.openrouter_model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload)},
            ],
            "temperature": 0.3,
            "max_tokens": 400,
        }
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.openrouter_referer,
            "X-Title": settings.openrouter_title,
        }
        resp = await self._client.post(
            f"{settings.openrouter_base_url}/chat/completions", headers=headers, json=body
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        headline, points = _parse_llm_json(content)
        headline, points = _guard_output(headline, points)

        return MarketBrief(
            headline=headline,
            points=points,
            generated_at=datetime.now(timezone.utc).isoformat(),
            model=settings.openrouter_model,
        )

    async def aclose(self) -> None:
        await self._client.aclose()


def _parse_llm_json(content: str) -> tuple[str, list[str]]:
    # Be tolerant: strip stray markdown fences if the model added them.
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.MULTILINE).strip()
    data = json.loads(cleaned)
    headline = str(data.get("headline", "")).strip()
    points = [str(p).strip() for p in data.get("points", []) if str(p).strip()]
    if not headline or not points:
        raise ValueError("LLM returned empty headline/points")
    return headline, points


def _guard_output(headline: str, points: list[str]) -> tuple[str, list[str]]:
    """Reject the whole output if any trade-advice language slipped through.
    We fail closed (raise) rather than silently scrub, so we never show a
    half-sanitised tip."""
    combined = headline + " " + " ".join(points)
    if _FORBIDDEN.search(combined):
        raise ValueError("LLM output contained trade-advice language; rejected by guard")
    # Trim to a sane size regardless of what the model did.
    return headline[:160], [p[:200] for p in points[:5]]


brief_service = BriefService()
