"""
Thin, typed wrapper around Dhan's v2 Data APIs that this tool depends on:

  POST /optionchain            - full option chain for one (underlying, expiry)
  POST /optionchain/expirylist - available expiry dates for an underlying

Reference: https://dhanhq.co/docs/v2/option-chain/

Design notes
------------
* Dhan enforces a hard rate limit of **1 unique request per 3 seconds** on
  the option chain endpoint. We never call this client directly from a
  request handler in a tight loop — all polling goes through
  `services.poller.OptionChainPoller`, which serialises and throttles calls
  per (underlying, expiry) key. This client itself also carries a small
  built-in min-interval guard as a second line of defence.
* We use `tenacity` for retry-with-backoff on transient network errors /
  5xx responses, but we deliberately do NOT retry on 429 (rate limited) —
  instead we surface that to the caller so the poller can back off.
"""
from __future__ import annotations

import time
import asyncio
import logging
from typing import Optional

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings
from app.models.schemas import RawOptionChainResponse, UnderlyingSegment

logger = logging.getLogger("dhan_client")


class DhanRateLimitError(Exception):
    """Raised when Dhan responds with HTTP 429 for the option chain API."""


class DhanApiError(Exception):
    """Raised for any other non-success response from Dhan."""


class DhanClient:
    def __init__(
        self,
        access_token: Optional[str] = None,
        client_id: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        self.access_token = access_token or settings.dhan_access_token
        self.client_id = client_id or settings.dhan_client_id
        self.base_url = (base_url or settings.dhan_base_url).rstrip("/")
        self._client = httpx.AsyncClient(timeout=10.0)
        self._last_call_ts = 0.0
        self._min_interval = settings.option_chain_poll_interval_seconds

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "access-token": self.access_token,
            "client-id": self.client_id,
        }

    async def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_call_ts
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)

    async def _post(self, path: str, json_body: dict) -> dict:
        await self._throttle()
        self._last_call_ts = time.monotonic()
        return await self._post_raw(path, json_body)

    @retry(
        retry=retry_if_exception_type(httpx.TransportError),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def _post_raw(self, path: str, json_body: dict) -> dict:
        """POST without the option-chain-specific 3s throttle — used for
        endpoints with their own, separate rate limits (e.g. charts)."""
        if not self.access_token or not self.client_id:
            raise DhanApiError(
                "DHAN_ACCESS_TOKEN / DHAN_CLIENT_ID are not configured. "
                "Set them in backend/.env (see .env.example)."
            )

        url = f"{self.base_url}{path}"
        resp = await self._client.post(url, headers=self._headers(), json=json_body)

        if resp.status_code == 429:
            raise DhanRateLimitError(f"Dhan rate-limited request to {path}.")
        if resp.status_code >= 400:
            raise DhanApiError(f"Dhan API {path} returned {resp.status_code}: {resp.text}")

        return resp.json()

    async def get_option_chain(
        self,
        underlying_scrip: int,
        underlying_seg: UnderlyingSegment,
        expiry: str,
    ) -> RawOptionChainResponse:
        """Fetch the full option chain for one underlying + expiry."""
        body = {
            "UnderlyingScrip": underlying_scrip,
            "UnderlyingSeg": underlying_seg.value,
            "Expiry": expiry,
        }
        payload = await self._post("/optionchain", body)
        if payload.get("status") != "success":
            raise DhanApiError(f"Dhan API /optionchain returned non-success payload: {payload}")
        return RawOptionChainResponse.model_validate(payload)

    async def get_expiry_list(
        self,
        underlying_scrip: int,
        underlying_seg: UnderlyingSegment,
    ) -> list[str]:
        """Fetch all active expiry dates for an underlying."""
        body = {
            "UnderlyingScrip": underlying_scrip,
            "UnderlyingSeg": underlying_seg.value,
        }
        payload = await self._post("/optionchain/expirylist", body)
        if payload.get("status") != "success":
            raise DhanApiError(f"Dhan API /optionchain/expirylist returned non-success payload: {payload}")
        return payload.get("data", [])

    async def get_intraday_chart(
        self,
        security_id: str,
        exchange_segment: str,
        instrument: str,
        interval: str,
        from_date: str,
        to_date: str,
        oi: bool = False,
    ) -> dict:
        """
        Minute-resolution OHLCV (+ optional OI) candles, used for the
        candlestick + OI overlay chart. This is a *separate* Dhan endpoint
        from the option chain with its own rate limit, so it intentionally
        goes through `_post_raw` rather than the option-chain throttle.
        Docs: https://dhanhq.co/docs/v2/historical-data/
        """
        body = {
            "securityId": security_id,
            "exchangeSegment": exchange_segment,
            "instrument": instrument,
            "interval": interval,
            "oi": oi,
            "fromDate": from_date,
            "toDate": to_date,
        }
        # Note: unlike /optionchain, this endpoint's success response has no
        # {"status": "success"} envelope — it returns the candle arrays directly.
        return await self._post_raw("/charts/intraday", body)

    async def aclose(self) -> None:
        await self._client.aclose()


# A single shared client instance for the app's lifetime (httpx.AsyncClient
# is safe to reuse across requests / tasks; this also lets us share the
# throttle state across every caller).
dhan_client = DhanClient()
