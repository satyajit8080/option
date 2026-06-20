import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { SnapshotMeta } from "@/types";

interface Props {
  underlyingScrip: number | null;
  expiry: string | null;
  /** null = "Live" (no baseline override, default day-over-day OI compare) */
  selectedTimestamp: string | null;
  onSelect: (timestamp: string | null) => void;
}

/** Lets the user replay the chain's OI distribution as it stood at an
 *  earlier point in today's session (9:30 AM, 11:00 AM, etc.) — populated
 *  from whatever intraday snapshots `services/cache.py` has captured so
 *  far today. Selecting one also switches OI-buildup classification to
 *  diff against that snapshot instead of yesterday's close. */
export function SnapshotSelector({ underlyingScrip, expiry, selectedTimestamp, onSelect }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);

  useEffect(() => {
    if (!underlyingScrip || !expiry) return;
    let cancelled = false;
    const load = () => {
      api
        .getSnapshots(underlyingScrip, expiry)
        .then((res) => !cancelled && setSnapshots(res.snapshots))
        .catch(() => !cancelled && setSnapshots([]));
    };
    load();
    const interval = setInterval(load, 60000); // pick up newly-captured snapshots
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [underlyingScrip, expiry]);

  return (
    <div className="relative">
      <select
        aria-label="View OI snapshot as of an earlier time today"
        value={selectedTimestamp ?? "live"}
        onChange={(e) => onSelect(e.target.value === "live" ? null : e.target.value)}
        className="appearance-none bg-surface-2 border border-surface-border rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium outline-none cursor-pointer"
      >
        <option value="live">Live (vs. yesterday)</option>
        {snapshots.map((s) => (
          <option key={s.timestamp} value={s.timestamp}>
            Baseline: {s.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
