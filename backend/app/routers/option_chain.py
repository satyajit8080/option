"""
REST endpoints for the option chain itself. The WebSocket route in
`routers/websocket.py` is the primary path for the live dashboard (it
reuses the same shared `poller`), but these REST endpoints exist for:

  - initial page load (before the WS connection is established)
  - clients that just want a one-shot snapshot (e.g. a script, a mobile
    widget, server-side rendering)
  - the "intraday baseline" view used by the historical snapshot selector
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import FullChainResponse, Instrument, UnderlyingSegment
from app.services import cache
from app.services.analytics import build_analytics_bundle
from app.services.chain_builder import build_chain_view
from app.services.dhan_client import DhanApiError, DhanRateLimitError, dhan_client
from app.services.poller import poller

router = APIRouter(prefix="/api/option-chain", tags=["option-chain"])


def _instrument_from_query(underlying_scrip: int, underlying_seg: UnderlyingSegment, label: str) -> Instrument:
    return Instrument(
        label=label,
        underlying_scrip=underlying_scrip,
        underlying_seg=underlying_seg,
        kind="index" if underlying_seg == UnderlyingSegment.INDEX else "stock",
    )


@router.get("", response_model=FullChainResponse)
async def get_option_chain(
    underlying_scrip: int = Query(...),
    underlying_seg: UnderlyingSegment = Query(...),
    expiry: str = Query(..., description="YYYY-MM-DD"),
    label: str = Query("Instrument"),
) -> FullChainResponse:
    """Day-over-day view (OI compared against yesterday's session OI)."""
    instrument = _instrument_from_query(underlying_scrip, underlying_seg, label)
    try:
        return await poller.fetch_once(instrument, expiry)
    except (DhanApiError, DhanRateLimitError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/intraday-baseline", response_model=FullChainResponse)
async def get_option_chain_intraday_baseline(
    underlying_scrip: int = Query(...),
    underlying_seg: UnderlyingSegment = Query(...),
    expiry: str = Query(...),
    label: str = Query("Instrument"),
    baseline_timestamp: str = Query(..., description="ISO timestamp of an earlier intraday snapshot to diff against"),
) -> FullChainResponse:
    """
    Intraday-buildup view: OI change is computed against an earlier point
    *today* (e.g. 9:30 AM) instead of yesterday's close — powers the
    historical snapshot selector / intraday OI trend comparisons.
    """
    instrument = _instrument_from_query(underlying_scrip, underlying_seg, label)
    try:
        raw = await dhan_client.get_option_chain(underlying_scrip, underlying_seg, expiry)
    except (DhanApiError, DhanRateLimitError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    baseline = await cache.get_snapshot_baseline(underlying_scrip, expiry, baseline_timestamp)
    if baseline is None:
        raise HTTPException(status_code=404, detail="No snapshot found at or before that timestamp")

    chain = build_chain_view(raw, instrument, expiry, baseline_oi=baseline)
    iv_history = await cache.get_atm_iv_history(underlying_scrip, expiry)
    analytics = build_analytics_bundle(chain, iv_history)
    return FullChainResponse(chain=chain, analytics=analytics, is_stale=False)
