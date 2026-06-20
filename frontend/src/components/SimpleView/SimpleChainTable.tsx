import { useState } from "react";
import type { FullChainResponse, StrikeRow } from "@/types";
import { formatPrice, formatStrike } from "@/lib/format";
import {
  STRIKE_SIGNAL_LABEL,
  legSignal,
  maxOiAcross,
  windowAroundAtm,
  type StrikeSignal,
} from "@/lib/signals";

interface Props {
  data: FullChainResponse;
  /** Optional: deep-link to the advanced view's full table */
  onShowFull?: () => void;
}

function fmtOiLakh(oi: number): string {
  // Compact "82L" / "1.4Cr" style for the simple view.
  const abs = Math.abs(oi);
  if (abs >= 1_00_00_000) return `${(oi / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${Math.round(oi / 1_00_000)}L`;
  if (abs >= 1_000) return `${(oi / 1_000).toFixed(0)}K`;
  return `${oi}`;
}

const SIGNAL_CLASS: Record<StrikeSignal, string> = {
  heavy: "bg-bullish-soft text-bullish", // overridden per side below
  active: "bg-accent-soft text-accent",
  light: "bg-surface-2 text-text-faint",
};

function SignalChip({ signal, side }: { signal: StrikeSignal; side: "ce" | "pe" }) {
  let cls = SIGNAL_CLASS[signal];
  if (signal === "heavy") {
    cls = side === "ce" ? "bg-bullish-soft text-bullish" : "bg-bearish-soft text-bearish";
  }
  return (
    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {STRIKE_SIGNAL_LABEL[signal]}
    </span>
  );
}

const WINDOW_OPTIONS = [7, 10, 15];

/** Simplified, beginner-readable option chain as a clean table:
 *  Call OI | Call signal | Call LTP | Strike | Put LTP | Put signal | Put OI
 *  with subtle in-cell OI bars. All values bound to real StrikeRow data. */
export function SimpleChainTable({ data, onShowFull }: Props) {
  const [windowN, setWindowN] = useState(7);
  const rows = windowAroundAtm(data.chain.rows, data.chain.atm_strike, windowN);
  const maxOi = maxOiAcross(rows);

  const barWidth = (oi: number) => `${Math.max(12, (oi / (maxOi || 1)) * 100)}%`;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-faint mb-2 flex justify-between items-center">
        <span>Option chain</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 normal-case tracking-normal">
            {WINDOW_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setWindowN(n)}
                className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  windowN === n ? "bg-accent text-bg" : "text-text-muted hover:text-text-primary"
                }`}
              >
                ±{n}
              </button>
            ))}
          </div>
          {onShowFull && (
            <button onClick={onShowFull} className="text-accent text-[13px] normal-case tracking-normal hover:underline">
              Show all columns (IV, Greeks, Volume) →
            </button>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="text-xs text-text-faint px-4 pt-3 pb-3">
          Each row is a strike price. Longer bar = more open interest (more trader activity) at that strike.
        </div>
        <div className="flex gap-3.5 flex-wrap text-xs text-text-muted px-4 pb-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bullish" /> Call side (above price = resistance)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bearish" /> Put side (below price = support)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent" /> ATM — strike nearest current price
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th className="text-bullish">Call OI</Th>
                <Th className="text-bullish">Call signal</Th>
                <Th className="text-bullish">Call LTP</Th>
                <Th className="text-text-primary bg-surface-2/60">Strike</Th>
                <Th className="text-bearish">Put LTP</Th>
                <Th className="text-bearish">Put signal</Th>
                <Th className="text-bearish">Put OI</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ChainRow key={r.strike} row={r} maxOi={maxOi} barWidth={barWidth} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-center whitespace-nowrap px-2 py-2.5 text-[13px] font-semibold border-b border-surface-border ${className}`}>
      {children}
    </th>
  );
}

function ChainRow({
  row,
  maxOi,
  barWidth,
}: {
  row: StrikeRow;
  maxOi: number;
  barWidth: (oi: number) => string;
}) {
  const isAtm = row.is_atm;
  const ce = row.ce;
  const pe = row.pe;

  return (
    <tr className={`border-b border-surface-border/45 ${isAtm ? "bg-accent/[0.08]" : ""}`}>
      {/* Call OI with bar */}
      <td className="relative text-center px-2 py-2.5 min-w-[90px]">
        {ce && (
          <span
            className="absolute top-1/2 -translate-y-1/2 right-2 h-[22px] rounded-sm bg-bullish opacity-[0.16]"
            style={{ width: barWidth(ce.oi) }}
            aria-hidden
          />
        )}
        <span className="relative z-10 font-mono tabnum font-semibold">{ce ? fmtOiLakh(ce.oi) : "—"}</span>
      </td>
      {/* Call signal */}
      <td className="text-center px-2 py-2.5">
        {ce ? <SignalChip signal={legSignal(ce.oi, maxOi, ce.buildup)} side="ce" /> : "—"}
      </td>
      {/* Call LTP */}
      <td className="text-center px-2 py-2.5 font-mono tabnum text-text-muted">{ce ? formatPrice(ce.ltp) : "—"}</td>
      {/* Strike */}
      <td className={`text-center px-2 py-2.5 font-mono tabnum font-bold bg-surface-2/40 ${isAtm ? "text-accent" : ""}`}>
        {formatStrike(row.strike)}
        {isAtm && " •"}
      </td>
      {/* Put LTP */}
      <td className="text-center px-2 py-2.5 font-mono tabnum text-text-muted">{pe ? formatPrice(pe.ltp) : "—"}</td>
      {/* Put signal */}
      <td className="text-center px-2 py-2.5">
        {pe ? <SignalChip signal={legSignal(pe.oi, maxOi, pe.buildup)} side="pe" /> : "—"}
      </td>
      {/* Put OI with bar */}
      <td className="relative text-center px-2 py-2.5 min-w-[90px]">
        {pe && (
          <span
            className="absolute top-1/2 -translate-y-1/2 left-2 h-[22px] rounded-sm bg-bearish opacity-[0.16]"
            style={{ width: barWidth(pe.oi) }}
            aria-hidden
          />
        )}
        <span className="relative z-10 font-mono tabnum font-semibold">{pe ? fmtOiLakh(pe.oi) : "—"}</span>
      </td>
    </tr>
  );
}
