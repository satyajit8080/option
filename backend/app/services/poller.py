"""
Orchestrates the live data pipeline for one (underlying, expiry) "topic":

    Dhan REST poll  ->  chain_builder  ->  analytics  ->  cache snapshot
                                                       ->  broadcast to WS clients

Because Dhan's Option Chain endpoint is rate-limited to 1 request per 3
seconds *per unique request*, we run exactly one poller task per
(underlying_scrip, expiry) pair no matter how many frontend clients are
subscribed to it — this is the piece that makes "WebSocket push to many
browser tabs" compatible with "throttled REST pull from one upstream API".

If a poll fails (Dhan down, market closed, network hiccup) we fall back to
the last-known-good snapshot from `services.cache` and mark the payload
`is_stale=True` with a reason, rather than breaking the UI.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import WebSocket

from app.config import settings
from app.models.schemas import FullChainResponse, Instrument
from app.services import cache
from app.services.analytics import build_analytics_bundle
from app.services.chain_builder import build_chain_view
from app.services.dhan_client import DhanApiError, DhanRateLimitError, dhan_client

logger = logging.getLogger("poller")


@dataclass
class _Topic:
    instrument: Instrument
    expiry: str
    subscribers: set[WebSocket] = field(default_factory=set)
    task: asyncio.Task | None = None
    latest: FullChainResponse | None = None

    @property
    def key(self) -> str:
        return f"{self.instrument.underlying_scrip}:{self.expiry}"


class OptionChainPoller:
    def __init__(self) -> None:
        self._topics: dict[str, _Topic] = {}
        self._lock = asyncio.Lock()

    # -- subscription management -------------------------------------------------

    async def subscribe(self, ws: WebSocket, instrument: Instrument, expiry: str) -> _Topic:
        async with self._lock:
            key = f"{instrument.underlying_scrip}:{expiry}"
            topic = self._topics.get(key)
            if topic is None:
                topic = _Topic(instrument=instrument, expiry=expiry)
                self._topics[key] = topic
                topic.task = asyncio.create_task(self._run_topic(topic))
                logger.info("Started poller for %s", key)
            topic.subscribers.add(ws)
            return topic

    async def unsubscribe(self, ws: WebSocket, instrument: Instrument, expiry: str) -> None:
        async with self._lock:
            key = f"{instrument.underlying_scrip}:{expiry}"
            topic = self._topics.get(key)
            if not topic:
                return
            topic.subscribers.discard(ws)
            if not topic.subscribers and topic.task:
                topic.task.cancel()
                del self._topics[key]
                logger.info("Stopped poller for %s (no subscribers)", key)

    # -- one-shot fetch (used by plain REST endpoints, not just WS) --------------

    async def fetch_once(self, instrument: Instrument, expiry: str) -> FullChainResponse:
        try:
            raw = await dhan_client.get_option_chain(
                instrument.underlying_scrip, instrument.underlying_seg, expiry
            )
            chain = build_chain_view(raw, instrument, expiry)
            await cache.save_snapshot(chain)
            await cache.append_pcr_history(
                instrument.underlying_scrip,
                expiry,
                sum(r.pe.oi for r in chain.rows if r.pe) / max(sum(r.ce.oi for r in chain.rows if r.ce), 1),
            )
            iv_history = await cache.get_atm_iv_history(instrument.underlying_scrip, expiry)
            analytics = build_analytics_bundle(chain, iv_history)
            response = FullChainResponse(chain=chain, analytics=analytics, is_stale=False)

            await cache.save_last_good(
                instrument.underlying_scrip, expiry, response.model_dump(mode="json")
            )
            return response

        except (DhanApiError, DhanRateLimitError) as exc:
            logger.warning("Dhan fetch failed for %s/%s: %s", instrument.label, expiry, exc)
            fallback = await cache.get_last_good(instrument.underlying_scrip, expiry)
            if fallback:
                fallback["is_stale"] = True
                fallback["stale_reason"] = str(exc)
                try:
                    return FullChainResponse.model_validate(fallback)
                except Exception:
                    logger.exception(
                        "Cached fallback for %s/%s was malformed — surfacing original error instead",
                        instrument.label, expiry,
                    )
            raise

    # -- background polling loop --------------------------------------------------

    async def _run_topic(self, topic: _Topic) -> None:
        while True:
            try:
                response = await self.fetch_once(topic.instrument, topic.expiry)
                topic.latest = response
                await self._broadcast(topic, response)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Unexpected error polling %s", topic.key)

            await asyncio.sleep(settings.option_chain_poll_interval_seconds)

    async def _broadcast(self, topic: _Topic, response: FullChainResponse) -> None:
        if not topic.subscribers:
            return
        payload = {
            "type": "chain_update",
            "topic": topic.key,
            "data": response.model_dump(mode="json"),
            "server_time": datetime.now(timezone.utc).isoformat(),
        }
        dead: list[WebSocket] = []
        for ws in topic.subscribers:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            topic.subscribers.discard(ws)


poller = OptionChainPoller()
