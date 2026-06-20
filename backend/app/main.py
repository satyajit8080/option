"""
FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload --port 8000

Docs:
    http://localhost:8000/docs
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from app.config import settings
from app.routers import analytics, brief, charts, instruments, option_chain, snapshots, websocket
from app.services import cache
from app.services.dhan_client import dhan_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    # Graceful shutdown: close the shared httpx client and Redis connection
    # pool instead of letting them be garbage-collected mid-event-loop-close.
    await dhan_client.aclose()
    from app.services.brief import brief_service
    await brief_service.aclose()
    await cache.get_redis().aclose()


app = FastAPI(
    title="Option Chain & Data Analyser API",
    description=(
        "Backend for an NSE/BSE option chain analytics dashboard built on the Dhan API. "
        "All analytics are framed as observational signals, not trade advice."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(instruments.router)
app.include_router(option_chain.router)
app.include_router(analytics.router)
app.include_router(snapshots.router)
app.include_router(charts.router)
app.include_router(brief.router)
app.include_router(websocket.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "env": settings.app_env}


@app.get("/")
async def root() -> dict:
    return {
        "name": "Option Chain & Data Analyser API",
        "docs": "/docs",
        "disclaimer": (
            "For informational and analytical purposes only. Not SEBI-registered "
            "investment advice. No output from this API constitutes a buy/sell recommendation."
        ),
    }
