import { memo } from "react";
import type { StrikeRow } from "@/types";
import { formatOi, formatPrice, formatStrike, buildupColor } from "@/lib/format";

interface Props {
  row: StrikeRow;
  style: React.CSSProperties;
  strikeRange: { min: number; max: number };
}

function oiBarWidth(oi: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(2, (oi / max) * 100)}%`;
}

/** One strike row: CE side | strike | PE side, mirroring the layout
 *  traders already know from the NSE website's own option chain page. */
export const OptionChainRow = memo(function OptionChainRow({ row, style, strikeRange }: Props) {
  const ce = row.ce;
  const pe = row.pe;

  return (
    <div
      style={style}
      className={`grid grid-cols-[1fr_auto_1fr] items-stretch text-xs border-b border-surface-border/60 ${
        row.is_atm ? "bg-accent/[0.07]" : "hover:bg-surface-2/60"
      }`}
    >
      {/* CE side */}
      <div className="grid grid-cols-7 items-center px-2 relative">
        {ce && (
          <div
            className="absolute inset-y-0 right-0 bg-bullish/[0.08]"
            style={{ width: oiBarWidth(ce.oi, strikeRange.max) }}
            aria-hidden
          />
        )}
        <span className="relative z-10 tabnum">{ce ? formatOi(ce.oi) : "—"}</span>
        <span className={`relative z-10 tabnum ${ce ? buildupColor[ce.buildup] : "text-text-faint"}`}>
          {ce ? formatPct(ce.oi_change_pct) : "—"}
        </span>
        <span className="relative z-10 tabnum hidden md:inline">{ce ? formatOi(ce.volume) : "—"}</span>
        <span className="relative z-10 tabnum hidden lg:inline">{ce ? ce.iv.toFixed(1) : "—"}</span>
        <span className="relative z-10 tabnum hidden xl:inline">{ce ? ce.delta.toFixed(2) : "—"}</span>
        <span className="relative z-10 tabnum font-medium text-text-primary">{ce ? formatPrice(ce.ltp) : "—"}</span>
        <span className="relative z-10 tabnum hidden md:inline text-text-faint">
          {ce ? `${formatPrice(ce.bid)}/${formatPrice(ce.ask)}` : "—"}
        </span>
      </div>

      {/* Strike */}
      <div
        className={`flex items-center justify-center px-3 font-mono font-semibold tabnum ${
          row.is_atm ? "text-accent" : "text-text-primary"
        }`}
      >
        {formatStrike(row.strike)}
        {row.is_atm && <span className="ml-1.5 text-[9px] uppercase tracking-wide text-accent/80">ATM</span>}
      </div>

      {/* PE side (mirrored order: price first, closest to strike) */}
      <div className="grid grid-cols-7 items-center px-2 relative">
        {pe && (
          <div
            className="absolute inset-y-0 left-0 bg-bearish/[0.08]"
            style={{ width: oiBarWidth(pe.oi, strikeRange.max) }}
            aria-hidden
          />
        )}
        <span className="relative z-10 tabnum hidden md:inline text-text-faint">
          {pe ? `${formatPrice(pe.bid)}/${formatPrice(pe.ask)}` : "—"}
        </span>
        <span className="relative z-10 tabnum font-medium text-text-primary">{pe ? formatPrice(pe.ltp) : "—"}</span>
        <span className="relative z-10 tabnum hidden xl:inline">{pe ? pe.delta.toFixed(2) : "—"}</span>
        <span className="relative z-10 tabnum hidden lg:inline">{pe ? pe.iv.toFixed(1) : "—"}</span>
        <span className="relative z-10 tabnum hidden md:inline">{pe ? formatOi(pe.volume) : "—"}</span>
        <span className={`relative z-10 tabnum ${pe ? buildupColor[pe.buildup] : "text-text-faint"}`}>
          {pe ? formatPct(pe.oi_change_pct) : "—"}
        </span>
        <span className="relative z-10 tabnum">{pe ? formatOi(pe.oi) : "—"}</span>
      </div>
    </div>
  );
});

function formatPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
