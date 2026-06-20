"""
Pydantic data models shared across the backend.

`Greeks`, `LegData` and the raw-fetch helpers mirror Dhan's actual Option
Chain API response shape (see https://dhanhq.co/docs/v2/option-chain/):

    {
      "data": {
        "last_price": 25642.8,
        "oc": {
          "25650.000000": {
            "ce": { "average_price": ..., "greeks": {...}, "implied_volatility": ...,
                    "last_price": ..., "oi": ..., "previous_close_price": ...,
                    "previous_oi": ..., "previous_volume": ..., "security_id": ...,
                    "top_ask_price": ..., "top_ask_quantity": ...,
                    "top_bid_price": ..., "top_bid_quantity": ..., "volume": ... },
            "pe": { ... same shape ... }
          },
          ...
        }
      },
      "status": "success"
    }

Everything below `RawOptionChainResponse` is *our own* derived/analytics
layer — this is what the frontend actually consumes.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Raw Dhan response models (1:1 mapping to their API contract)
# ---------------------------------------------------------------------------

class Greeks(BaseModel):
    delta: float = 0.0
    theta: float = 0.0
    gamma: float = 0.0
    vega: float = 0.0


class RawLeg(BaseModel):
    average_price: float = 0.0
    greeks: Greeks = Field(default_factory=Greeks)
    implied_volatility: float = 0.0
    last_price: float = 0.0
    oi: int = 0
    previous_close_price: float = 0.0
    previous_oi: int = 0
    previous_volume: int = 0
    security_id: Optional[int] = None
    top_ask_price: float = 0.0
    top_ask_quantity: int = 0
    top_bid_price: float = 0.0
    top_bid_quantity: int = 0
    volume: int = 0


class RawStrikeEntry(BaseModel):
    ce: Optional[RawLeg] = None
    pe: Optional[RawLeg] = None


class RawOptionChainData(BaseModel):
    last_price: float
    oc: dict[str, RawStrikeEntry]


class RawOptionChainResponse(BaseModel):
    data: RawOptionChainData
    status: str


# ---------------------------------------------------------------------------
# Instrument metadata
# ---------------------------------------------------------------------------

class UnderlyingSegment(str, Enum):
    """Mirrors Dhan's `UnderlyingSeg` enum for the segments this tool covers."""
    INDEX = "IDX_I"
    NSE_EQUITY = "NSE_EQ"
    BSE_EQUITY = "BSE_EQ"


class Instrument(BaseModel):
    """A selectable underlying (index or stock)."""
    label: str  # e.g. "NIFTY 50"
    underlying_scrip: int  # Dhan security id of the underlying
    underlying_seg: UnderlyingSegment
    kind: Literal["index", "stock"]
    lot_size: int = 0


class ExpiryListResponse(BaseModel):
    underlying_scrip: int
    expiries: list[str]


# ---------------------------------------------------------------------------
# Derived per-leg / per-strike view models (used by the frontend table)
# ---------------------------------------------------------------------------

class OiBuildup(str, Enum):
    LONG_BUILDUP = "long_buildup"
    SHORT_BUILDUP = "short_buildup"
    LONG_UNWINDING = "long_unwinding"
    SHORT_COVERING = "short_covering"
    NEUTRAL = "neutral"


class OptionLegView(BaseModel):
    ltp: float
    oi: int
    oi_change: int
    oi_change_pct: float
    volume: int
    iv: float
    delta: float
    gamma: float
    theta: float
    vega: float
    bid: float
    ask: float
    buildup: OiBuildup


class StrikeRow(BaseModel):
    strike: float
    is_atm: bool
    ce: Optional[OptionLegView] = None
    pe: Optional[OptionLegView] = None


class OptionChainView(BaseModel):
    """The fully-processed option chain payload sent to the frontend."""
    underlying_label: str
    underlying_scrip: int
    expiry: str
    spot_price: float
    atm_strike: float
    fetched_at: str  # ISO timestamp
    rows: list[StrikeRow]


# ---------------------------------------------------------------------------
# Analytics: Max Pain
# ---------------------------------------------------------------------------

class MaxPainPoint(BaseModel):
    strike: float
    total_pain: float


class MaxPainResult(BaseModel):
    max_pain_strike: float
    spot_price: float
    distance_points: float
    distance_pct: float
    curve: list[MaxPainPoint]


# ---------------------------------------------------------------------------
# Analytics: PCR
# ---------------------------------------------------------------------------

class PcrZone(str, Enum):
    BEARISH = "bearish"
    NEUTRAL = "neutral"
    BULLISH = "bullish"


class StrikePcr(BaseModel):
    strike: float
    pcr: float


class PcrResult(BaseModel):
    overall_pcr: float
    zone: PcrZone
    total_ce_oi: int
    total_pe_oi: int
    strike_wise: list[StrikePcr]


class PcrHistoryPoint(BaseModel):
    timestamp: str
    pcr: float


# ---------------------------------------------------------------------------
# Analytics: OI buildup quadrant
# ---------------------------------------------------------------------------

class OiBuildupRow(BaseModel):
    strike: float
    side: Literal["CE", "PE"]
    oi: int
    oi_change_pct: float
    price_change_pct: float
    buildup: OiBuildup


class UnusualOiAlert(BaseModel):
    strike: float
    side: Literal["CE", "PE"]
    oi_change_pct: float
    message: str


# ---------------------------------------------------------------------------
# Analytics: Support / Resistance
# ---------------------------------------------------------------------------

class WallLevel(BaseModel):
    strike: float
    oi: int
    distance_pct: float
    status: Literal["defended", "under_pressure", "broken"]


class SupportResistanceResult(BaseModel):
    resistance_walls: list[WallLevel]  # CE walls, sorted by OI desc
    support_walls: list[WallLevel]  # PE walls, sorted by OI desc


# ---------------------------------------------------------------------------
# Analytics: IV
# ---------------------------------------------------------------------------

class IvSkewPoint(BaseModel):
    strike: float
    ce_iv: Optional[float] = None
    pe_iv: Optional[float] = None


class IvAnalysisResult(BaseModel):
    atm_iv: float
    iv_rank: Optional[float] = None  # None until enough history is collected
    iv_percentile: Optional[float] = None
    skew: list[IvSkewPoint]


# ---------------------------------------------------------------------------
# Analytics: Greeks dashboard
# ---------------------------------------------------------------------------

class GreeksAggregate(BaseModel):
    net_delta: float
    total_ce_delta: float
    total_pe_delta: float
    total_gamma: float
    total_theta: float
    total_vega: float
    market_maker_bias: Literal["long_gamma", "short_gamma", "neutral"]


# ---------------------------------------------------------------------------
# Analytics: Sentiment summary
# ---------------------------------------------------------------------------

class SentimentLabel(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"
    SIDEWAYS = "sideways"


class SentimentFactor(BaseModel):
    name: str
    observation: str
    leaning: SentimentLabel


class SentimentSummary(BaseModel):
    label: SentimentLabel
    confidence: float  # 0-1, rough agreement-of-signals score
    factors: list[SentimentFactor]
    disclaimer: str = (
        "Analytical observation only — derived from OI, PCR, Max Pain and IV "
        "patterns. Not investment advice or a recommendation to transact."
    )


# ---------------------------------------------------------------------------
# Snapshots (historical intraday)
# ---------------------------------------------------------------------------

class SnapshotMeta(BaseModel):
    timestamp: str
    label: str  # e.g. "09:30", "11:00"


class SnapshotListResponse(BaseModel):
    underlying_scrip: int
    expiry: str
    snapshots: list[SnapshotMeta]


# ---------------------------------------------------------------------------
# Intraday candles (for the candlestick + OI overlay chart)
# ---------------------------------------------------------------------------

class IntradayCandles(BaseModel):
    open: list[float] = Field(default_factory=list)
    high: list[float] = Field(default_factory=list)
    low: list[float] = Field(default_factory=list)
    close: list[float] = Field(default_factory=list)
    volume: list[int] = Field(default_factory=list)
    timestamp: list[int] = Field(default_factory=list)  # epoch seconds
    open_interest: list[int] = Field(default_factory=list)


class OiTimeSeriesPoint(BaseModel):
    timestamp: float  # epoch seconds
    total_ce_oi: int
    total_pe_oi: int


class PriceOiOverlayResponse(BaseModel):
    candles: IntradayCandles
    oi_series: list[OiTimeSeriesPoint]


# ---------------------------------------------------------------------------
# Combined "everything for this expiry" bundle — what /api/option-chain returns
# ---------------------------------------------------------------------------

class AnalyticsBundle(BaseModel):
    max_pain: MaxPainResult
    pcr: PcrResult
    support_resistance: SupportResistanceResult
    iv: IvAnalysisResult
    greeks: GreeksAggregate
    sentiment: SentimentSummary
    unusual_oi: list[UnusualOiAlert]


class FullChainResponse(BaseModel):
    chain: OptionChainView
    analytics: AnalyticsBundle
    is_stale: bool = False
    stale_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# AI market brief (OpenRouter-generated, observational only)
# ---------------------------------------------------------------------------

class MarketBrief(BaseModel):
    """An LLM-written, plain-language summary of what the options data shows.

    STRICTLY observational — the generation prompt and a server-side guard
    both forbid buy/sell/enter/exit language. `points` is a short list of
    skimmable bullet observations; `headline` is a one-line gist.
    """
    headline: str
    points: list[str]
    generated_at: str            # ISO timestamp of when the LLM produced this
    model: str                   # which OpenRouter model produced it
    is_stale: bool = False       # served from cache past the soft window
    disclaimer: str = (
        "AI-generated analytical summary of options data — not investment "
        "advice or a recommendation to transact."
    )


class BriefUnavailable(BaseModel):
    """Returned when the brief can't be produced (no API key, LLM error).
    Keeps the endpoint non-breaking so the UI degrades gracefully."""
    available: bool = False
    reason: str
