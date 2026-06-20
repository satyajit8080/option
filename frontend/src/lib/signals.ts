// Derives the plain-language "Simple view" labels (Green/Red/Neutral verdict,
// summary-table rows, per-strike Call/Put signals) PURELY from the existing
// FullChainResponse the backend already returns. No backend changes needed —
// every input here is already on the wire.
//
// IMPORTANT (product + legal constraint): these are observational labels only.
// Nothing here emits buy/sell/enter/exit language. "Green/Red/Neutral" describes
// what the options data is leaning, not a recommendation to transact.
import type {
  FullChainResponse,
  PcrZone,
  SentimentLabel,
  StrikeRow,
} from "@/types";

export type Signal = "green" | "red" | "neutral";

/** Map the backend's sentiment label → a simple traffic-light signal. */
export function sentimentToSignal(label: SentimentLabel): Signal {
  switch (label) {
    case "bullish":
      return "green";
    case "bearish":
      return "red";
    default:
      return "neutral"; // neutral + sideways both read as "neutral" here
  }
}

export function pcrZoneToSignal(zone: PcrZone): Signal {
  switch (zone) {
    case "bullish":
      return "green";
    case "bearish":
      return "red";
    default:
      return "neutral";
  }
}

export const SIGNAL_WORD: Record<Signal, string> = {
  green: "Green — Strong",
  red: "Red — Weak",
  neutral: "Neutral — Flat",
};

export const SIGNAL_SHORT: Record<Signal, string> = {
  green: "Green · Up",
  red: "Red · Down",
  neutral: "Neutral",
};

/** One-line plain-English verdict sentence for the big banner. Built from the
 *  real range (nearest support/resistance walls) so it stays truthful. */
export function buildVerdictLine(data: FullChainResponse): {
  signal: Signal;
  word: string;
  line: string;
  agreeText: string;
  rangeLow: number | null;
  rangeHigh: number | null;
} {
  const { analytics } = data;
  const signal = sentimentToSignal(analytics.sentiment.label);

  // Nearest support below spot and nearest resistance above spot = the
  // "likely range" the mockup shows. Walls come pre-sorted by OI desc, so
  // re-sort by proximity to spot to find the *nearest* meaningful barrier.
  const spot = data.chain.spot_price;
  const supportsBelow = analytics.support_resistance.support_walls
    .filter((w) => w.strike <= spot)
    .sort((a, b) => b.strike - a.strike);
  const resistAbove = analytics.support_resistance.resistance_walls
    .filter((w) => w.strike >= spot)
    .sort((a, b) => a.strike - b.strike);

  const rangeLow = supportsBelow[0]?.strike ?? null;
  const rangeHigh = resistAbove[0]?.strike ?? null;

  const direction = signal === "green" ? "up" : signal === "red" ? "down" : "flat / sideways";

  let line: string;
  if (rangeLow !== null && rangeHigh !== null) {
    line = `Options data is leaning ${direction} right now. Price is likely to stay between ${rangeLow.toLocaleString("en-IN")} and ${rangeHigh.toLocaleString("en-IN")} unless it breaks out.`;
  } else {
    line = `Options data is leaning ${direction} right now.`;
  }

  // "3 of 4 agree" style text from the sentiment factors.
  const total = analytics.sentiment.factors.length;
  const agreeing = analytics.sentiment.factors.filter(
    (f) => sentimentToSignal(f.leaning) === signal,
  ).length;
  const agreeText = total > 0 ? `${agreeing} of ${total} signals agree` : "";

  return {
    signal,
    word: SIGNAL_WORD[signal],
    line,
    agreeText,
    rangeLow,
    rangeHigh,
  };
}

export interface SummaryRow {
  indicator: string;
  hint?: string;
  value: string;
  signal: Signal;
  signalLabel: string;
  meaning: string;
}

/** Build the rows for the top summary table — all derived from real data. */
export function buildSummaryRows(data: FullChainResponse): SummaryRow[] {
  const { chain, analytics } = data;
  const verdict = buildVerdictLine(data);
  const spot = chain.spot_price;

  const topResistance = [...analytics.support_resistance.resistance_walls].sort((a, b) => b.oi - a.oi)[0];
  const topSupport = [...analytics.support_resistance.support_walls].sort((a, b) => b.oi - a.oi)[0];

  const maxPain = analytics.max_pain;
  const maxPainSignal: Signal = "neutral"; // distance is "watch", not directional on its own
  const maxPainDist = Math.round(maxPain.distance_points);

  const rows: SummaryRow[] = [
    {
      indicator: "Overall trend",
      value: "—",
      signal: verdict.signal,
      signalLabel: SIGNAL_SHORT[verdict.signal],
      meaning:
        verdict.agreeText
          ? `${verdict.agreeText}. ${verdict.signal === "neutral" ? "No clear direction." : "A mild tilt, not a strong trend."}`
          : "Derived from PCR, Max Pain, OI walls and IV skew.",
    },
    {
      indicator: "PCR",
      hint: "(Put-Call Ratio)",
      value: analytics.pcr.overall_pcr.toFixed(2),
      signal: pcrZoneToSignal(analytics.pcr.zone),
      signalLabel: SIGNAL_SHORT[pcrZoneToSignal(analytics.pcr.zone)],
      meaning:
        "More puts vs calls being written. Below 0.7 = down lean, above 1.3 = up lean.",
    },
    {
      indicator: "Max Pain",
      value: maxPain.max_pain_strike.toLocaleString("en-IN"),
      signal: maxPainSignal,
      signalLabel: "Watch",
      meaning: `Price where most option buyers lose. Price often drifts toward it by expiry — it's ${Math.abs(maxPainDist)} pts ${maxPainDist >= 0 ? "below" : "above"} spot now.`,
    },
  ];

  if (topResistance) {
    rows.push({
      indicator: "Resistance",
      hint: "(ceiling)",
      value: topResistance.strike.toLocaleString("en-IN"),
      signal: "red",
      signalLabel: "Strong",
      meaning: "Heaviest call activity sits here — acts like a ceiling. Price struggles to rise above it.",
    });
  }
  if (topSupport) {
    rows.push({
      indicator: "Support",
      hint: "(floor)",
      value: topSupport.strike.toLocaleString("en-IN"),
      signal: "green",
      signalLabel: "Strong",
      meaning: "Heaviest put activity sits here — acts like a floor. Price struggles to fall below it.",
    });
  }

  if (verdict.rangeLow !== null && verdict.rangeHigh !== null) {
    rows.push({
      indicator: "Likely range today",
      value: `${verdict.rangeLow.toLocaleString("en-IN")}–${verdict.rangeHigh.toLocaleString("en-IN")}`,
      signal: "neutral",
      signalLabel: "Range",
      meaning: "Expect price to move within this band. A break either side changes the picture.",
    });
  }

  // keep `spot` referenced for future use without triggering unused-var lint
  void spot;
  return rows;
}

export type StrikeSignal = "heavy" | "active" | "light";

/** Per-strike, per-side activity label for the simplified chain table.
 *  Driven by each leg's share of the visible max OI + its OI-change buildup. */
export function legSignal(
  oi: number,
  maxOi: number,
  buildup: StrikeRow["ce"] extends infer L ? (L extends { buildup: infer B } ? B : never) : never,
): StrikeSignal {
  const share = maxOi > 0 ? oi / maxOi : 0;
  if (share >= 0.6) return "heavy";
  if (share >= 0.3 || buildup === "long_buildup" || buildup === "short_buildup") return "active";
  return "light";
}

export const STRIKE_SIGNAL_LABEL: Record<StrikeSignal, string> = {
  heavy: "Heavy writing",
  active: "Active",
  light: "Light",
};

/** Compute the max OI across the visible strike window, for bar scaling. */
export function maxOiAcross(rows: StrikeRow[]): number {
  let m = 0;
  for (const r of rows) {
    if (r.ce) m = Math.max(m, r.ce.oi);
    if (r.pe) m = Math.max(m, r.pe.oi);
  }
  return m;
}

/** Slice the chain to ±N strikes around ATM for the simple table default. */
export function windowAroundAtm(rows: StrikeRow[], atmStrike: number, n: number): StrikeRow[] {
  const i = rows.findIndex((r) => r.strike === atmStrike);
  if (i === -1) return rows;
  return rows.slice(Math.max(0, i - n), Math.min(rows.length, i + n + 1));
}
