import { useMemo } from "react";
import type { StrikeRow } from "@/types";
import { formatOi, formatStrike } from "@/lib/format";

interface Props {
  rows: StrikeRow[];
  atmStrike: number;
  strikeWindow?: number;
}

function intensity(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.sqrt(value / max); // sqrt scaling so mid-range OI isn't washed out
}

/** A two-row heat strip (CE / PE) across strikes for the current expiry —
 *  scans faster than the bar chart for spotting *where* OI concentrates at
 *  a glance. (A true multi-expiry heatmap would need one option-chain call
 *  per expiry; left as a natural extension once you're polling more than
 *  one expiry at a time — see the README.) */
export function OIHeatmap({ rows, atmStrike, strikeWindow = 20 }: Props) {
  const windowed = useMemo(() => {
    const atmIndex = rows.findIndex((r) => r.strike === atmStrike);
    return atmIndex === -1 ? rows : rows.slice(Math.max(0, atmIndex - strikeWindow), atmIndex + strikeWindow + 1);
  }, [rows, atmStrike, strikeWindow]);

  const maxOi = useMemo(
    () => Math.max(1, ...windowed.flatMap((r) => [r.ce?.oi ?? 0, r.pe?.oi ?? 0])),
    [windowed],
  );

  return (
    <div className="panel p-4 overflow-x-auto scrollbar-thin">
      <h3 className="font-semibold text-sm mb-3">OI Concentration Heatmap</h3>
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="w-10 shrink-0" />
          {windowed.map((r) => (
            <div
              key={`label-${r.strike}`}
              className={`w-7 shrink-0 text-center text-[9px] -rotate-45 origin-bottom-left translate-y-2 ${
                r.strike === atmStrike ? "text-accent font-semibold" : "text-text-faint"
              }`}
            >
              {formatStrike(r.strike)}
            </div>
          ))}
        </div>
        {(["ce", "pe"] as const).map((side) => (
          <div key={side} className="flex items-center mt-1">
            <div className={`w-10 shrink-0 text-[10px] font-medium ${side === "ce" ? "text-bullish" : "text-bearish"}`}>
              {side.toUpperCase()}
            </div>
            {windowed.map((r) => {
              const leg = side === "ce" ? r.ce : r.pe;
              const oi = leg?.oi ?? 0;
              const alpha = intensity(oi, maxOi);
              const color = side === "ce" ? `rgba(45,212,167,${alpha})` : `rgba(242,96,125,${alpha})`;
              return (
                <div
                  key={`${side}-${r.strike}`}
                  title={`${side.toUpperCase()} ${formatStrike(r.strike)}: ${formatOi(oi)} OI`}
                  className={`w-7 h-7 shrink-0 border border-surface-border/40 ${r.strike === atmStrike ? "ring-1 ring-accent" : ""}`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
