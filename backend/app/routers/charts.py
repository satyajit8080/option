"""
Powers the "Candlestick Chart with OI Overlay" panel: minute-resolution
underlying price candles from Dhan's Intraday Historical Data API, combined
with our own intraday total-OI time series (captured by the poller into
Redis — see `services/cache.py`).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import IntradayCandles, OiTimeSeriesPoint, PriceOiOverlayResponse
from app.services import cache
from app.services.dhan_client import DhanApiError, DhanRateLimitError, dhan_client

router = APIRouter(prefix="/api/charts", tags=["charts"])


@router.get("/intraday-with-oi", response_model=PriceOiOverlayResponse)
async def get_intraday_with_oi(
    security_id: str = Query(..., description="Dhan security id of the underlying/future to chart"),
    exchange_segment: str = Query(..., description='e.g. "IDX_I", "NSE_EQ", "NSE_FNO"'),
    instrument: str = Query(..., description='e.g. "INDEX", "EQUITY", "FUTIDX"'),
    interval: str = Query("5", description="1, 5, 15, 25 or 60 (minutes)"),
    from_date: str = Query(..., description="YYYY-MM-DD HH:MM:SS"),
    to_date: str = Query(..., description="YYYY-MM-DD HH:MM:SS"),
    # These two are only needed to look up our own cached OI time series —
    # they're independent of the candle request above (you can chart the
    # underlying's price against the OI of any expiry of its option chain).
    underlying_scrip: int = Query(...),
    expiry: str = Query(...),
) -> PriceOiOverlayResponse:
    try:
        raw = await dhan_client.get_intraday_chart(
            security_id, exchange_segment, instrument, interval, from_date, to_date
        )
    except (DhanApiError, DhanRateLimitError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch intraday chart from Dhan: {exc}") from exc

    candles = IntradayCandles.model_validate(raw)
    oi_points_raw = await cache.get_oi_time_series(underlying_scrip, expiry)
    oi_series = [OiTimeSeriesPoint(timestamp=p["ts"], total_ce_oi=p["total_ce_oi"], total_pe_oi=p["total_pe_oi"]) for p in oi_points_raw]

    return PriceOiOverlayResponse(candles=candles, oi_series=oi_series)
