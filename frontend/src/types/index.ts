// Mirrors backend/app/models/schemas.py — keep these in sync if the API
// response shape changes. Field names match the JSON exactly (snake_case)
// rather than being remapped to camelCase, to avoid a translation layer
// that has historically been a common source of subtle bugs.

export type UnderlyingSeg = "IDX_I" | "NSE_EQ" | "BSE_EQ";

export interface Instrument {
  label: string;
  underlying_scrip: number;
  underlying_seg: UnderlyingSeg;
  kind: "index" | "stock";
  lot_size?: number;
}

export type OiBuildup =
  | "long_buildup"
  | "short_buildup"
  | "long_unwinding"
  | "short_covering"
  | "neutral";

export interface OptionLegView {
  ltp: number;
  oi: number;
  oi_change: number;
  oi_change_pct: number;
  volume: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  bid: number;
  ask: number;
  buildup: OiBuildup;
}

export interface StrikeRow {
  strike: number;
  is_atm: boolean;
  ce: OptionLegView | null;
  pe: OptionLegView | null;
}

export interface OptionChainView {
  underlying_label: string;
  underlying_scrip: number;
  expiry: string;
  spot_price: number;
  atm_strike: number;
  fetched_at: string;
  rows: StrikeRow[];
}

export interface MaxPainPoint {
  strike: number;
  total_pain: number;
}

export interface MaxPainResult {
  max_pain_strike: number;
  spot_price: number;
  distance_points: number;
  distance_pct: number;
  curve: MaxPainPoint[];
}

export type PcrZone = "bearish" | "neutral" | "bullish";

export interface StrikePcr {
  strike: number;
  pcr: number;
}

export interface PcrResult {
  overall_pcr: number;
  zone: PcrZone;
  total_ce_oi: number;
  total_pe_oi: number;
  strike_wise: StrikePcr[];
}

export interface PcrHistoryPoint {
  timestamp: string;
  pcr: number;
}

export interface WallLevel {
  strike: number;
  oi: number;
  distance_pct: number;
  status: "defended" | "under_pressure" | "broken";
}

export interface SupportResistanceResult {
  resistance_walls: WallLevel[];
  support_walls: WallLevel[];
}

export interface IvSkewPoint {
  strike: number;
  ce_iv: number | null;
  pe_iv: number | null;
}

export interface IvAnalysisResult {
  atm_iv: number;
  iv_rank: number | null;
  iv_percentile: number | null;
  skew: IvSkewPoint[];
}

export interface GreeksAggregate {
  net_delta: number;
  total_ce_delta: number;
  total_pe_delta: number;
  total_gamma: number;
  total_theta: number;
  total_vega: number;
  market_maker_bias: "long_gamma" | "short_gamma" | "neutral";
}

export type SentimentLabel = "bullish" | "bearish" | "neutral" | "sideways";

export interface SentimentFactor {
  name: string;
  observation: string;
  leaning: SentimentLabel;
}

export interface SentimentSummary {
  label: SentimentLabel;
  confidence: number;
  factors: SentimentFactor[];
  disclaimer: string;
}

export interface UnusualOiAlert {
  strike: number;
  side: "CE" | "PE";
  oi_change_pct: number;
  message: string;
}

export interface AnalyticsBundle {
  max_pain: MaxPainResult;
  pcr: PcrResult;
  support_resistance: SupportResistanceResult;
  iv: IvAnalysisResult;
  greeks: GreeksAggregate;
  sentiment: SentimentSummary;
  unusual_oi: UnusualOiAlert[];
}

export interface FullChainResponse {
  chain: OptionChainView;
  analytics: AnalyticsBundle;
  is_stale: boolean;
  stale_reason: string | null;
}

export interface SnapshotMeta {
  timestamp: string;
  label: string;
}

export interface SnapshotListResponse {
  underlying_scrip: number;
  expiry: string;
  snapshots: SnapshotMeta[];
}

export interface ExpiryListResponse {
  underlying_scrip: number;
  expiries: string[];
}

export interface IntradayCandles {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timestamp: number[]; // epoch seconds
  open_interest: number[];
}

export interface OiTimeSeriesPoint {
  timestamp: number; // epoch seconds
  total_ce_oi: number;
  total_pe_oi: number;
}

export interface PriceOiOverlayResponse {
  candles: IntradayCandles;
  oi_series: OiTimeSeriesPoint[];
}

// --- WebSocket envelope types ------------------------------------------------

export type WsServerMessage =
  | { type: "subscribed"; topic: string }
  | { type: "unsubscribed" }
  | { type: "chain_update"; topic: string; data: FullChainResponse; server_time?: string }
  | { type: "error"; message: string };

export interface WsSubscribeMessage {
  action: "subscribe";
  underlying_scrip: number;
  underlying_seg: UnderlyingSeg;
  expiry: string;
  label: string;
}

// --- AI market brief ---
export interface MarketBrief {
  headline: string;
  points: string[];
  generated_at: string;
  model: string;
  is_stale: boolean;
  disclaimer: string;
}

export interface BriefUnavailable {
  available: false;
  reason: string;
}

export type BriefResponse = MarketBrief | BriefUnavailable;

export function isBriefAvailable(b: BriefResponse): b is MarketBrief {
  return (b as BriefUnavailable).available !== false;
}
