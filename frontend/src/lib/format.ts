// Formatting helpers tuned for an Indian retail-trader audience: OI and
// volume read far more naturally in Lakh/Crore than in raw integers or
// Western thousands-grouping.
import type { OiBuildup, PcrZone, SentimentLabel } from "@/types";

export function formatOi(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${(value / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function formatIndianNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(value));
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatStrike(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

export function formatPct(value: number, withSign = true): string {
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// --- Color tokens per semantic state (Tailwind class fragments) ------------

export const buildupColor: Record<OiBuildup, string> = {
  long_buildup: "text-bullish",
  short_covering: "text-bullish",
  short_buildup: "text-bearish",
  long_unwinding: "text-bearish",
  neutral: "text-text-muted",
};

export const buildupLabel: Record<OiBuildup, string> = {
  long_buildup: "Long Buildup",
  short_covering: "Short Covering",
  short_buildup: "Short Buildup",
  long_unwinding: "Long Unwinding",
  neutral: "Neutral",
};

export const sentimentColor: Record<SentimentLabel, string> = {
  bullish: "text-bullish",
  bearish: "text-bearish",
  neutral: "text-text-muted",
  sideways: "text-warn",
};

export const sentimentBg: Record<SentimentLabel, string> = {
  bullish: "bg-bullish-soft border-bullish/30",
  bearish: "bg-bearish-soft border-bearish/30",
  neutral: "bg-surface-2 border-surface-border",
  sideways: "bg-warn-soft border-warn/30",
};

export const pcrZoneColor: Record<PcrZone, string> = {
  bullish: "text-bullish",
  bearish: "text-bearish",
  neutral: "text-warn",
};
