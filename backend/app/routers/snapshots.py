"""
Endpoints powering the "historical snapshot selector" and the OI
time-series / PCR-trend charts. See `services/cache.py` for what is
actually stored (lightweight per-strike OI maps + PCR readings, scoped to
the current IST trading day).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import PcrHistoryPoint, SnapshotListResponse
from app.services import cache

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("/{underlying_scrip}/{expiry}", response_model=SnapshotListResponse)
async def list_snapshots(underlying_scrip: int, expiry: str) -> SnapshotListResponse:
    snaps = await cache.list_snapshots(underlying_scrip, expiry)
    return SnapshotListResponse(underlying_scrip=underlying_scrip, expiry=expiry, snapshots=snaps)


@router.get("/{underlying_scrip}/{expiry}/oi-at")
async def get_oi_at_snapshot(underlying_scrip: int, expiry: str, timestamp: str = Query(...)) -> dict:
    """Strike-wise CE/PE OI as captured at (or just before) `timestamp`."""
    baseline = await cache.get_snapshot_baseline(underlying_scrip, expiry, timestamp)
    if baseline is None:
        raise HTTPException(status_code=404, detail="No snapshot found at or before that timestamp")
    return {"underlying_scrip": underlying_scrip, "expiry": expiry, "timestamp": timestamp, "oi": baseline}


@router.get("/{underlying_scrip}/{expiry}/oi-time-series")
async def get_oi_time_series(underlying_scrip: int, expiry: str) -> list[dict]:
    """Total CE/PE OI summed across all strikes, sampled at every captured
    intraday snapshot — powers the Intraday OI Trend chart."""
    return await cache.get_oi_time_series(underlying_scrip, expiry)


@router.get("/{underlying_scrip}/{expiry}/pcr-history", response_model=list[PcrHistoryPoint])
async def get_pcr_history(underlying_scrip: int, expiry: str) -> list[PcrHistoryPoint]:
    return await cache.get_pcr_history(underlying_scrip, expiry)
