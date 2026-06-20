"""
A minimal async rate limiter usable anywhere we call a throttled upstream
API. `DhanClient` has its own purpose-built min-interval guard for the
Option Chain endpoint (see `services/dhan_client.py`), but this generic
version is here for any other endpoint you add later (e.g. instrument
search, historical data) that has its own distinct rate limit.

Usage:
    limiter = AsyncRateLimiter(min_interval_seconds=1.0)
    async with limiter:
        await call_some_api()
"""
from __future__ import annotations

import asyncio
import time


class AsyncRateLimiter:
    def __init__(self, min_interval_seconds: float) -> None:
        self.min_interval = min_interval_seconds
        self._lock = asyncio.Lock()
        self._last_call = 0.0

    async def __aenter__(self) -> "AsyncRateLimiter":
        async with self._lock:
            elapsed = time.monotonic() - self._last_call
            if elapsed < self.min_interval:
                await asyncio.sleep(self.min_interval - elapsed)
            self._last_call = time.monotonic()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None
