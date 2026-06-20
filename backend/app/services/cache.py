"""
Redis-backed caching layer. Three responsibilities:

1. Intraday OI snapshots — lets the frontend's "historical snapshot
   selector" replay the chain as it looked at 9:30, 11:00, 1:30pm etc., and
   lets `chain_builder.build_chain_view` diff against an arbitrary earlier
   point in the day for true intraday OI-buildup classification.

2. Time-series history for PCR and ATM IV — feeds the PCR trend chart and
   IV Rank/Percentile (which need a rolling window of past readings).

3. Last-known-good chain cache — so if Dhan's API is down or the market is
   closed, we can serve the last successful response with a clear
   `is_stale=True` flag instead of a hard error (per the "graceful
   fallback UI" requirement).

All keys are scoped per (underlying_scrip, expiry, IST-calendar-date) so
intraday data naturally resets each trading day without an explicit cron.
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import redis.asyncio as redis

from app.config import settings
from app.models.schemas import OptionChainView, PcrHistoryPoint, SnapshotMeta

IST = ZoneInfo("Asia/Kolkata")

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _today_str() -> str:
    return datetime.now(IST).strftime("%Y%m%d")


def _snapshot_key(scrip: int, expiry: str) -> str:
    return f"oi_snapshot:{scrip}:{expiry}:{_today_str()}"


def _pcr_history_key(scrip: int, expiry: str) -> str:
    return f"pcr_history:{scrip}:{expiry}:{_today_str()}"


def _iv_history_key(scrip: int, expiry: str) -> str:
    return f"atm_iv_history:{scrip}:{expiry}"


def _last_good_key(scrip: int, expiry: str) -> str:
    return f"last_chain:{scrip}:{expiry}"


# ---------------------------------------------------------------------------
# Intraday OI snapshots
# ---------------------------------------------------------------------------

def _strike_oi_map(chain: OptionChainView) -> dict:
    return {
        f"{row.strike:.6f}": {
            "ce": row.ce.oi if row.ce else 0,
            "pe": row.pe.oi if row.pe else 0,
        }
        for row in chain.rows
    }


async def save_snapshot(chain: OptionChainView, retention_hours: int | None = None) -> None:
    r = get_redis()
    key = _snapshot_key(chain.underlying_scrip, chain.expiry)
    now_ts = time.time()
    member = json.dumps({"ts": now_ts, "oi": _strike_oi_map(chain)})
    await r.zadd(key, {member: now_ts})
    ttl = (retention_hours or settings.snapshot_retention_hours) * 3600
    await r.expire(key, ttl)


async def list_snapshots(scrip: int, expiry: str) -> list[SnapshotMeta]:
    r = get_redis()
    key = _snapshot_key(scrip, expiry)
    members = await r.zrange(key, 0, -1)
    out: list[SnapshotMeta] = []
    for m in members:
        try:
            blob = json.loads(m)
        except json.JSONDecodeError:
            continue
        dt = datetime.fromtimestamp(blob["ts"], IST)
        out.append(SnapshotMeta(timestamp=dt.isoformat(), label=dt.strftime("%H:%M")))
    return out


async def get_snapshot_baseline(scrip: int, expiry: str, timestamp_iso: str) -> dict[str, dict[str, int]] | None:
    """Returns the {strike_str: {ce, pe}} OI map captured at (or just
    before) the requested ISO timestamp, for use as a `baseline_oi` in
    `chain_builder.build_chain_view`."""
    r = get_redis()
    key = _snapshot_key(scrip, expiry)
    target_ts = datetime.fromisoformat(timestamp_iso).timestamp()
    # Highest-scoring member with score <= target_ts
    members = await r.zrangebyscore(key, "-inf", target_ts)
    if not members:
        return None
    blob = json.loads(members[-1])
    return blob["oi"]


async def get_oi_time_series(scrip: int, expiry: str) -> list[dict]:
    """Every captured snapshot today, reduced to {ts, total_ce_oi,
    total_pe_oi} — feeds the Intraday OI Trend chart and the OI overlay
    on the candlestick chart."""
    r = get_redis()
    key = _snapshot_key(scrip, expiry)
    members = await r.zrange(key, 0, -1)
    points = []
    for m in members:
        blob = json.loads(m)
        total_ce = sum(v.get("ce", 0) for v in blob["oi"].values())
        total_pe = sum(v.get("pe", 0) for v in blob["oi"].values())
        points.append({"ts": blob["ts"], "total_ce_oi": total_ce, "total_pe_oi": total_pe})
    return points


# ---------------------------------------------------------------------------
# PCR trend history
# ---------------------------------------------------------------------------

async def append_pcr_history(scrip: int, expiry: str, pcr_value: float, max_points: int = 500) -> None:
    r = get_redis()
    key = _pcr_history_key(scrip, expiry)
    point = json.dumps({"ts": time.time(), "pcr": pcr_value})
    await r.rpush(key, point)
    await r.ltrim(key, -max_points, -1)
    await r.expire(key, settings.snapshot_retention_hours * 3600)


async def get_pcr_history(scrip: int, expiry: str) -> list[PcrHistoryPoint]:
    r = get_redis()
    key = _pcr_history_key(scrip, expiry)
    raw_points = await r.lrange(key, 0, -1)
    out = []
    for p in raw_points:
        blob = json.loads(p)
        dt = datetime.fromtimestamp(blob["ts"], IST)
        out.append(PcrHistoryPoint(timestamp=dt.isoformat(), pcr=blob["pcr"]))
    return out


# ---------------------------------------------------------------------------
# ATM IV rolling history (for IV Rank / Percentile)
# ---------------------------------------------------------------------------

async def append_atm_iv(scrip: int, expiry: str, iv_value: float, max_points: int = 252) -> None:
    """`max_points=252` mirrors the common ~1-trading-year IV Rank window;
    feed this once per session close (or more often intraday, per your
    sampling strategy) from a scheduled job."""
    r = get_redis()
    key = _iv_history_key(scrip, expiry)
    await r.rpush(key, iv_value)
    await r.ltrim(key, -max_points, -1)


async def get_atm_iv_history(scrip: int, expiry: str) -> list[float]:
    r = get_redis()
    key = _iv_history_key(scrip, expiry)
    raw = await r.lrange(key, 0, -1)
    return [float(v) for v in raw]


# ---------------------------------------------------------------------------
# Last-known-good chain (graceful fallback when Dhan API / market is down)
# ---------------------------------------------------------------------------

async def save_last_good(scrip: int, expiry: str, payload: dict) -> None:
    r = get_redis()
    await r.set(_last_good_key(scrip, expiry), json.dumps(payload), ex=24 * 3600)


async def get_last_good(scrip: int, expiry: str) -> dict | None:
    r = get_redis()
    raw = await r.get(_last_good_key(scrip, expiry))
    return json.loads(raw) if raw else None
