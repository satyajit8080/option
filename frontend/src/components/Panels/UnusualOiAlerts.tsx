import type { UnusualOiAlert } from "@/types";
import { formatStrike } from "@/lib/format";

interface Props {
  alerts: UnusualOiAlert[];
}

export function UnusualOiAlerts({ alerts }: Props) {
  return (
    <div className="panel p-4">
      <h3 className="font-semibold text-sm mb-3">Unusual OI Activity</h3>
      {alerts.length === 0 ? (
        <p className="text-xs text-text-faint">No strikes with an outsized OI swing right now.</p>
      ) : (
        <div className="space-y-1.5">
          {alerts.map((a) => (
            <div key={`${a.side}-${a.strike}`} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`pill ${a.side === "CE" ? "bg-bullish-soft text-bullish" : "bg-bearish-soft text-bearish"}`}>
                  {a.side}
                </span>
                <span className="font-mono tabnum">{formatStrike(a.strike)}</span>
              </div>
              <span className={a.oi_change_pct > 0 ? "text-bullish tabnum" : "text-bearish tabnum"}>
                {a.oi_change_pct > 0 ? "+" : ""}
                {a.oi_change_pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
