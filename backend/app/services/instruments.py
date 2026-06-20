"""
Resolves human-friendly instrument names ("NIFTY 50", "RELIANCE") to the
(UnderlyingScrip, UnderlyingSeg) pair Dhan's Option Chain API expects.

Two sources of truth:

1. `KNOWN_INDICES` — a small hardcoded seed list for the major indices.
   NIFTY (13) and BANKNIFTY (25) on segment IDX_I are confirmed directly
   from Dhan's own sample code. The remaining index IDs below are widely
   reused across the Dhan algo-trading community but are NOT independently
   verified here — re-check them against the scrip master (see #2) before
   relying on them in production, since Dhan can renumber instruments.

2. `ScripMasterService` — downloads and caches Dhan's official instrument
   CSV (refreshed daily per Dhan's own recommendation) and lets you resolve
   *any* NSE/BSE-listed stock by trading symbol. This is the only reliable
   way to cover "individual stock options" generically, since there is no
   sane way to hardcode thousands of stock security IDs.
   Docs: https://dhanhq.co/docs/v2/instruments/
   CSV:  https://images.dhan.co/api-data/api-scrip-master-detailed.csv
"""
from __future__ import annotations

import csv
import io
import logging
import time
from dataclasses import dataclass

import httpx

from app.models.schemas import Instrument, UnderlyingSegment

logger = logging.getLogger("instruments")

SCRIP_MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv"

# --- Seed list for major indices --------------------------------------------------
# label -> Instrument
KNOWN_INDICES: dict[str, Instrument] = {
    "NIFTY 50": Instrument(
        label="NIFTY 50", underlying_scrip=13, underlying_seg=UnderlyingSegment.INDEX, kind="index", lot_size=75
    ),
    "BANK NIFTY": Instrument(
        label="BANK NIFTY", underlying_scrip=25, underlying_seg=UnderlyingSegment.INDEX, kind="index", lot_size=35
    ),
    # ⚠️ Seed values below are commonly cited but NOT independently confirmed
    # in this codebase — verify against the scrip master before trusting them.
    "FIN NIFTY": Instrument(
        label="FIN NIFTY", underlying_scrip=27, underlying_seg=UnderlyingSegment.INDEX, kind="index", lot_size=40
    ),
    "MIDCAP NIFTY": Instrument(
        label="MIDCAP NIFTY", underlying_scrip=442, underlying_seg=UnderlyingSegment.INDEX, kind="index", lot_size=120
    ),
    "SENSEX": Instrument(
        label="SENSEX", underlying_scrip=51, underlying_seg=UnderlyingSegment.INDEX, kind="index", lot_size=20
    ),
    "BANKEX": Instrument(
        label="BANKEX", underlying_scrip=69, underlying_seg=UnderlyingSegment.INDEX, kind="index", lot_size=30
    ),
}


@dataclass
class _CachedMaster:
    rows: list[dict]
    fetched_at: float


class ScripMasterService:
    """Downloads + caches Dhan's scrip master CSV and exposes stock search."""

    REFRESH_INTERVAL_SECONDS = 6 * 60 * 60  # Dhan refreshes this daily; 6h cache is plenty fresh

    def __init__(self) -> None:
        self._cache: _CachedMaster | None = None

    async def _ensure_loaded(self) -> list[dict]:
        if self._cache and (time.time() - self._cache.fetched_at) < self.REFRESH_INTERVAL_SECONDS:
            return self._cache.rows

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(SCRIP_MASTER_URL)
            resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
        self._cache = _CachedMaster(rows=rows, fetched_at=time.time())
        logger.info("Loaded %d rows from Dhan scrip master", len(rows))
        return rows

    @staticmethod
    def _get(row: dict, *candidate_keys: str) -> str | None:
        """Column names in Dhan's CSV have shifted before (e.g. casing,
        underscores) — match case-insensitively against several candidates
        instead of hardcoding one exact header string."""
        lower_map = {k.lower(): v for k, v in row.items()}
        for key in candidate_keys:
            if key.lower() in lower_map:
                return lower_map[key.lower()]
        return None

    async def search_stocks(self, query: str, limit: int = 15) -> list[Instrument]:
        """
        Search NSE/BSE equity underlyings (i.e. instruments that have a
        listed F&O options chain) by trading symbol or name, e.g. "RELI" ->
        RELIANCE.

        NOTE: filter on the row's "instrument" / "exch_id" columns to equity
        cash-segment rows only — exact column names should be confirmed
        against a freshly downloaded CSV, since this is re-derived from
        Dhan's documented CSV export rather than a live fixture.
        """
        rows = await self._ensure_loaded()
        query_lower = query.strip().upper()
        if not query_lower:
            return []

        matches: list[Instrument] = []
        for row in rows:
            symbol = self._get(row, "SEM_TRADING_SYMBOL", "TRADING_SYMBOL", "symbol_name")
            exch = self._get(row, "SEM_EXM_EXCH_ID", "EXCH_ID", "exchange")
            instrument_type = self._get(row, "SEM_INSTRUMENT_NAME", "INSTRUMENT_TYPE", "instrument")
            security_id = self._get(row, "SEM_SMST_SECURITY_ID", "SECURITY_ID", "security_id")

            if not symbol or not security_id:
                continue
            if query_lower not in symbol.upper():
                continue
            # Only equity cash-segment rows represent the *underlying* — the
            # option contracts themselves are separate rows we don't need here.
            if instrument_type and "EQUITY" not in instrument_type.upper() and "INDEX" not in instrument_type.upper():
                continue

            seg = UnderlyingSegment.BSE_EQUITY if (exch or "").upper().startswith("BSE") else UnderlyingSegment.NSE_EQUITY
            try:
                matches.append(
                    Instrument(
                        label=symbol,
                        underlying_scrip=int(security_id),
                        underlying_seg=seg,
                        kind="stock",
                    )
                )
            except ValueError:
                continue

            if len(matches) >= limit:
                break

        return matches


scrip_master_service = ScripMasterService()


def list_known_indices() -> list[Instrument]:
    return list(KNOWN_INDICES.values())
