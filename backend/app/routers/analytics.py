"""
Standalone analytics endpoints. These slice the same `AnalyticsBundle`
produced for the main option-chain payload, exposed individually so a
widget (e.g. just the Sentiment Panel, or just the Max Pain card) can poll
a small payload instead of pulling the entire chain every refresh.

Internally these all share the same throttled `poller.fetch_once`, so
adding more of these does NOT multiply load on the Dhan API.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import (
    GreeksAggregate,
    MaxPainResult,
    PcrResult,
    SentimentSummary,
    SupportResistanceResult,
    UnderlyingSegment,
    UnusualOiAlert,
)
from app.routers.option_chain import _instrument_from_query
from app.services.dhan_client import DhanApiError, DhanRateLimitError
from app.services.poller import poller

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


async def _bundle(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str):
    instrument = _instrument_from_query(underlying_scrip, underlying_seg, label)
    try:
        full = await poller.fetch_once(instrument, expiry)
    except (DhanApiError, DhanRateLimitError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return full.analytics


@router.get("/max-pain", response_model=MaxPainResult)
async def max_pain(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str = "Instrument") -> MaxPainResult:
    return (await _bundle(underlying_scrip, underlying_seg, expiry, label)).max_pain


@router.get("/pcr", response_model=PcrResult)
async def pcr(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str = "Instrument") -> PcrResult:
    return (await _bundle(underlying_scrip, underlying_seg, expiry, label)).pcr


@router.get("/support-resistance", response_model=SupportResistanceResult)
async def support_resistance(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str = "Instrument") -> SupportResistanceResult:
    return (await _bundle(underlying_scrip, underlying_seg, expiry, label)).support_resistance


@router.get("/greeks", response_model=GreeksAggregate)
async def greeks(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str = "Instrument") -> GreeksAggregate:
    return (await _bundle(underlying_scrip, underlying_seg, expiry, label)).greeks


@router.get("/sentiment", response_model=SentimentSummary)
async def sentiment(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str = "Instrument") -> SentimentSummary:
    return (await _bundle(underlying_scrip, underlying_seg, expiry, label)).sentiment


@router.get("/unusual-oi", response_model=list[UnusualOiAlert])
async def unusual_oi(underlying_scrip: int, underlying_seg: UnderlyingSegment, expiry: str, label: str = "Instrument") -> list[UnusualOiAlert]:
    return (await _bundle(underlying_scrip, underlying_seg, expiry, label)).unusual_oi
