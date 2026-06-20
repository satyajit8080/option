// Maps a Signal (green/red/neutral) to the Tailwind class fragments the rest
// of the app already uses, so the simple view stays visually consistent with
// the advanced dashboard instead of introducing a parallel color system.
import type { Signal } from "@/lib/signals";

export const signalText: Record<Signal, string> = {
  green: "text-bullish",
  red: "text-bearish",
  neutral: "text-warn",
};

export const signalTagClass: Record<Signal, string> = {
  green: "bg-bullish-soft text-bullish",
  red: "bg-bearish-soft text-bearish",
  neutral: "bg-warn-soft text-warn",
};

export const signalEmoji: Record<Signal, string> = {
  green: "🟢",
  red: "🔴",
  neutral: "🟡",
};

export const signalBorder: Record<Signal, string> = {
  green: "border-bullish/40",
  red: "border-bearish/40",
  neutral: "border-warn/40",
};

export const signalGradient: Record<Signal, string> = {
  green: "linear-gradient(90deg, rgba(45,212,167,.10), transparent 55%)",
  red: "linear-gradient(90deg, rgba(242,96,125,.10), transparent 55%)",
  neutral: "linear-gradient(90deg, rgba(232,179,57,.10), transparent 55%)",
};
