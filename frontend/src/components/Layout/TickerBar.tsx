import { SnapshotSelector } from "@/components/Controls/SnapshotSelector";
import { formatPrice, formatStrike, formatTime } from "@/lib/format";
import type { DashboardData } from "@/hooks/useDashboardData";

/** The spot/ATM/last-updated ticker row + snapshot selector + the
 *  stale/baseline/error/loading banners. Shared by both views so the header
 *  region is identical regardless of which view is active. */
export function TickerBar({ d }: { d: DashboardData }) {
  const chain = d.data?.chain;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-5">
        <div>
          <div className="text-xs text-text-faint">
            {chain?.underlying_label ?? d.selectedInstrument?.label ?? "—"}
          </div>
          <div className="font-mono text-2xl font-bold tabnum">{chain ? formatPrice(chain.spot_price) : "—"}</div>
        </div>
        <div className="hidden sm:block">
          <div className="text-xs text-text-faint">ATM Strike</div>
          <div className="font-mono text-lg font-semibold text-accent tabnum">
            {chain ? formatStrike(chain.atm_strike) : "—"}
          </div>
        </div>
        <div className="hidden md:block">
          <div className="text-xs text-text-faint">Last updated</div>
          <div className="font-mono text-sm tabnum">
            {d.lastUpdated ? formatTime(d.lastUpdated.toISOString()) : "—"}
          </div>
        </div>
      </div>

      <SnapshotSelector
        underlyingScrip={d.selectedInstrument?.underlying_scrip ?? null}
        expiry={d.selectedExpiry}
        selectedTimestamp={d.baselineTimestamp}
        onSelect={d.setBaselineTimestamp}
      />
    </div>
  );
}

export function StatusBanners({ d }: { d: DashboardData }) {
  return (
    <>
      {d.baselineTimestamp && (
        <div className="panel border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent flex items-center justify-between">
          <span>
            Viewing OI buildup vs. the{" "}
            {new Date(d.baselineTimestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} snapshot
            — not the live day-over-day view.
          </span>
          <button onClick={() => d.setBaselineTimestamp(null)} className="underline hover:no-underline shrink-0 ml-3">
            Back to live
          </button>
        </div>
      )}

      {d.data?.is_stale && (
        <div className="panel border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          Showing the last known data — live updates are currently unavailable
          {d.data.stale_reason ? `: ${d.data.stale_reason}` : "."}
        </div>
      )}
      {d.error && !d.data && (
        <div className="panel border border-bearish/30 bg-bearish-soft px-4 py-2.5 text-sm text-bearish">{d.error}</div>
      )}
      {!d.data && !d.error && (
        <div className="panel p-10 text-center text-text-faint text-sm">Connecting to the live option chain feed…</div>
      )}
    </>
  );
}
