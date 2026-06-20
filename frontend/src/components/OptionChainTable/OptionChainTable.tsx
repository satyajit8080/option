import { useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { StrikeRow } from "@/types";
import { OptionChainRow } from "./OptionChainRow";

interface Props {
  rows: StrikeRow[];
  atmStrike: number;
  /** Number of strikes to show on each side of ATM. null = show all. */
  strikeWindow: number | null;
  onStrikeWindowChange: (w: number | null) => void;
}

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 56;

const WINDOW_OPTIONS: { label: string; value: number | null }[] = [
  { label: "±10", value: 10 },
  { label: "±20", value: 20 },
  { label: "±40", value: 40 },
  { label: "All", value: null },
];

export function OptionChainTable({ rows, atmStrike, strikeWindow, onStrikeWindowChange }: Props) {
  const listRef = useRef<FixedSizeList>(null);
  const [containerHeight, setContainerHeight] = useState(560);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleRows = useMemo(() => {
    if (strikeWindow === null) return rows;
    const atmIndex = rows.findIndex((r) => r.strike === atmStrike);
    if (atmIndex === -1) return rows;
    const start = Math.max(0, atmIndex - strikeWindow);
    const end = Math.min(rows.length, atmIndex + strikeWindow + 1);
    return rows.slice(start, end);
  }, [rows, atmStrike, strikeWindow]);

  const strikeRange = useMemo(() => {
    let max = 0;
    for (const r of visibleRows) {
      if (r.ce) max = Math.max(max, r.ce.oi);
      if (r.pe) max = Math.max(max, r.pe.oi);
    }
    return { min: 0, max };
  }, [visibleRows]);

  // Auto-scroll to ATM strike whenever the underlying/expiry changes.
  useEffect(() => {
    const atmIndex = visibleRows.findIndex((r) => r.strike === atmStrike);
    if (atmIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(atmIndex, "center");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atmStrike, strikeWindow]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setContainerHeight(Math.max(280, h));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const Row = ({ index, style }: ListChildComponentProps) => (
    <OptionChainRow row={visibleRows[index]} style={style} strikeRange={strikeRange} />
  );

  return (
    <div className="panel flex flex-col h-full min-h-0">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">Option Chain</h2>
          <span className="text-text-faint text-xs">{visibleRows.length} strikes</span>
        </div>
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => onStrikeWindowChange(opt.value)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                strikeWindow === opt.value ? "bg-accent text-bg" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] text-[10px] uppercase tracking-wide text-text-faint border-b border-surface-border bg-surface-2/50"
        style={{ height: HEADER_HEIGHT }}
      >
        <div className="grid grid-cols-7 items-center px-2 gap-0.5">
          <span>OI</span>
          <span>Chg%</span>
          <span className="hidden md:inline">Vol</span>
          <span className="hidden lg:inline">IV</span>
          <span className="hidden xl:inline">Delta</span>
          <span className="text-bullish">LTP (CE)</span>
          <span className="hidden md:inline">Bid/Ask</span>
        </div>
        <div className="flex items-center justify-center px-3 font-semibold text-text-muted">Strike</div>
        <div className="grid grid-cols-7 items-center px-2 gap-0.5">
          <span className="hidden md:inline">Bid/Ask</span>
          <span className="text-bearish">LTP (PE)</span>
          <span className="hidden xl:inline">Delta</span>
          <span className="hidden lg:inline">IV</span>
          <span className="hidden md:inline">Vol</span>
          <span>Chg%</span>
          <span>OI</span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0">
        {visibleRows.length > 0 ? (
          <FixedSizeList
            ref={listRef}
            height={containerHeight}
            width="100%"
            itemCount={visibleRows.length}
            itemSize={ROW_HEIGHT}
            className="scrollbar-thin"
          >
            {Row}
          </FixedSizeList>
        ) : (
          <div className="flex items-center justify-center h-full text-text-faint text-sm">
            No option chain data yet…
          </div>
        )}
      </div>
    </div>
  );
}
