"""
WebSocket endpoint for the live dashboard.

Client protocol (JSON messages over the socket):

  -> {"action": "subscribe", "underlying_scrip": 13, "underlying_seg": "IDX_I",
      "expiry": "2026-06-25", "label": "NIFTY 50"}
  -> {"action": "unsubscribe"}

  <- {"type": "subscribed", "topic": "13:2026-06-25"}
  <- {"type": "chain_update", "topic": "...", "data": <FullChainResponse>, "server_time": "..."}
  <- {"type": "error", "message": "..."}

Switching instrument/expiry is just sending a new "subscribe" message — the
server transparently unsubscribes you from the old topic (stopping that
poller if you were its last subscriber) and joins/starts the new one.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.schemas import Instrument, UnderlyingSegment
from app.services.poller import poller

logger = logging.getLogger("ws")
router = APIRouter()


@router.websocket("/ws/option-chain")
async def option_chain_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    current_instrument: Instrument | None = None
    current_expiry: str | None = None

    try:
        while True:
            msg = await websocket.receive_json()
            action = msg.get("action")

            if action == "subscribe":
                # Drop any prior subscription on this connection first.
                if current_instrument and current_expiry:
                    await poller.unsubscribe(websocket, current_instrument, current_expiry)

                try:
                    instrument = Instrument(
                        label=msg.get("label", "Instrument"),
                        underlying_scrip=int(msg["underlying_scrip"]),
                        underlying_seg=UnderlyingSegment(msg["underlying_seg"]),
                        kind="index" if msg["underlying_seg"] == UnderlyingSegment.INDEX.value else "stock",
                    )
                    expiry = msg["expiry"]
                except (KeyError, ValueError) as exc:
                    await websocket.send_json({"type": "error", "message": f"Bad subscribe payload: {exc}"})
                    continue

                topic = await poller.subscribe(websocket, instrument, expiry)
                current_instrument, current_expiry = instrument, expiry
                await websocket.send_json({"type": "subscribed", "topic": topic.key})

                # Send the latest cached snapshot immediately so the UI
                # doesn't sit blank until the next poll tick.
                if topic.latest:
                    await websocket.send_json({
                        "type": "chain_update",
                        "topic": topic.key,
                        "data": topic.latest.model_dump(mode="json"),
                    })

            elif action == "unsubscribe":
                if current_instrument and current_expiry:
                    await poller.unsubscribe(websocket, current_instrument, current_expiry)
                    current_instrument, current_expiry = None, None
                await websocket.send_json({"type": "unsubscribed"})

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error")
    finally:
        if current_instrument and current_expiry:
            await poller.unsubscribe(websocket, current_instrument, current_expiry)
