import type { SupportResistanceResult, WallLevel } from "@/types";
import { formatOi, formatPct, formatStrike } from "@/lib/format";

interface Props {
  data: SupportResistanceResult;
}

const STATUS_BADGE: Record<WallLevel["status"], { label: string; cls: string }> = {
  defended: { label: "Defended", cls: "bg-surface-2 text-text-muted" },
  under_pressure: { label: "Under pressure", cls: "bg-warn-soft text-warn" },
  broken: { label: "Broken", cls: "bg-bearish-soft text-bearish" },
};

function WallRow({ wall, side }: { wall: WallLevel; side: "ce" | "pe" }) {
  const badge = STATUS_BADGE[wall.status];
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${side === "ce" ? "bg-bullish" : "bg-bearish"}`} />
        <span className="font-mono text-sm tabnum">{formatStrike(wall.strike)}</span>
        <span className="text-text-faint text-xs tabnum">{formatPct(wall.distance_pct)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-faint tabnum">{formatOi(wall.oi)} OI</span>
        <span className={`pill ${badge.cls}`}>{badge.label}</span>
      </div>
    </div>
  );
}

export function SupportResistancePanel({ data }: Props) {
  return (
    <div className="panel p-4">
      <h3 className="font-semibold text-sm mb-3">Support &amp; Resistance (OI Walls)</h3>

      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wide text-bearish mb-1">Resistance (CE wall)</div>
        <div className="divide-y divide-surface-border/60">
          {data.resistance_walls.map((w) => (
            <WallRow key={`r-${w.strike}`} wall={w} side="ce" />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-bullish mb-1">Support (PE wall)</div>
        <div className="divide-y divide-surface-border/60">
          {data.support_walls.map((w) => (
            <WallRow key={`s-${w.strike}`} wall={w} side="pe" />
          ))}
        </div>
      </div>
    </div>
  );
}
