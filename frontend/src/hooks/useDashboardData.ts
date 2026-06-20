import { useEffect, useState } from "react";
import { useOptionChainSelection } from "@/hooks/useOptionChain";
import { useLiveData } from "@/hooks/useLiveData";
import { useAuxiliaryData } from "@/hooks/useAuxiliaryData";
import { api } from "@/api/client";
import type { FullChainResponse } from "@/types";

/**
 * Single source of truth for the dashboard's live data + selection state.
 * Extracted so the Simple and Advanced views render the SAME data from the
 * SAME WebSocket/REST wiring — switching views never re-subscribes or diverges.
 *
 * This preserves the exact behaviour the original Dashboard had (live WS feed,
 * polling fallback, intraday-baseline snapshot mode, auxiliary PCR/OI series).
 */
export function useDashboardData() {
  const selection = useOptionChainSelection();
  const { selectedInstrument, selectedExpiry } = selection;

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(0); // 0 = "Live" (WS push)
  const [baselineTimestamp, setBaselineTimestamp] = useState<string | null>(null);
  const [baselineData, setBaselineData] = useState<FullChainResponse | null>(null);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  const useWebSocket = refreshIntervalMs === 0;
  const liveFeed = useLiveData({
    instrument: selectedInstrument,
    expiry: selectedExpiry,
    enabled: autoRefresh && baselineTimestamp === null,
    useWebSocket,
    pollIntervalMs: refreshIntervalMs || 30000,
  });

  // Intraday-baseline mode: re-diff the current chain against an earlier
  // snapshot today, via /api/option-chain/intraday-baseline.
  useEffect(() => {
    if (!baselineTimestamp || !selectedInstrument || !selectedExpiry) {
      setBaselineData(null);
      return;
    }
    let cancelled = false;
    setBaselineError(null);

    const load = () => {
      api
        .getIntradayBaselineChain(
          selectedInstrument.underlying_scrip,
          selectedInstrument.underlying_seg,
          selectedExpiry,
          selectedInstrument.label,
          baselineTimestamp,
        )
        .then((res) => !cancelled && setBaselineData(res))
        .catch((e) => !cancelled && setBaselineError(e instanceof Error ? e.message : "Failed to load snapshot"));
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [baselineTimestamp, selectedInstrument, selectedExpiry]);

  const data = baselineTimestamp ? baselineData : liveFeed.data;
  const status = baselineTimestamp ? ("paused" as const) : liveFeed.status;
  const error = baselineTimestamp ? baselineError : liveFeed.error;
  const lastUpdated = baselineTimestamp ? null : liveFeed.lastUpdated;

  const aux = useAuxiliaryData(selectedInstrument?.underlying_scrip ?? null, selectedExpiry);

  return {
    ...selection,
    autoRefresh,
    setAutoRefresh,
    refreshIntervalMs,
    setRefreshIntervalMs,
    baselineTimestamp,
    setBaselineTimestamp,
    data,
    status,
    error,
    lastUpdated,
    pcrHistory: aux.pcrHistory,
    oiSeries: aux.oiSeries,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
