"""
Endpoint for the AI market brief shown below the option chain.

Reuses `poller.fetch_once` (the same throttled Dhan fetch the rest of the app
uses), so adding the brief does NOT increase load on the Dhan API. The LLM
call itself is gated by the shared cache + "as market changes" logic in
`services.brief`.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import BriefUnavailable, MarketBrief, UnderlyingSegment
from app.routers.option_chain import _instrument_from_query
from app.services.brief import brief_service
from app.services.dhan_client import DhanApiError, DhanRateLimitError
from app.services.poller import poller

router = APIRouter(prefix="/api/brief", tags=["brief"])


@router.get("", response_model=MarketBrief | BriefUnavailable)
async def get_market_brief(
    underlying_scrip: int = Query(...),
    underlying_seg: UnderlyingSegment = Query(...),
    expiry: str = Query(...),
    label: str = Query("Instrument"),
):
    instrument = _instrument_from_query(underlying_scrip, underlying_seg, label)
    try:
        full = await poller.fetch_once(instrument, expiry)
    except (DhanApiError, DhanRateLimitError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return await brief_service.get_brief(full)
