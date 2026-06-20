"""
Endpoints for the instrument/expiry selector controls in the frontend
header: list known indices, search stocks, and fetch the active expiry
list for a chosen underlying.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import ExpiryListResponse, Instrument, UnderlyingSegment
from app.services import instruments as instruments_service
from app.services.dhan_client import dhan_client

router = APIRouter(prefix="/api/instruments", tags=["instruments"])


@router.get("/indices", response_model=list[Instrument])
async def get_indices() -> list[Instrument]:
    return instruments_service.list_known_indices()


@router.get("/search", response_model=list[Instrument])
async def search_instruments(q: str = Query(..., min_length=1, description="Stock symbol search query")) -> list[Instrument]:
    try:
        return await instruments_service.scrip_master_service.search_stocks(q)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not fetch/search Dhan's instrument master: {exc}"
        ) from exc


@router.get("/{underlying_scrip}/expiries", response_model=ExpiryListResponse)
async def get_expiries(
    underlying_scrip: int,
    underlying_seg: UnderlyingSegment = Query(UnderlyingSegment.INDEX),
) -> ExpiryListResponse:
    try:
        expiries = await dhan_client.get_expiry_list(underlying_scrip, underlying_seg)
    except Exception as exc:  # surfaced as a clean 502 rather than a raw stack trace
        raise HTTPException(status_code=502, detail=f"Could not fetch expiries from Dhan: {exc}") from exc
    return ExpiryListResponse(underlying_scrip=underlying_scrip, expiries=expiries)
