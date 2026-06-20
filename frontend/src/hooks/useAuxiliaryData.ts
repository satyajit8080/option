import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { OiTimeSeriesPoint, PcrHistoryPoint } from "@/types";

const REFRESH_MS = 20000;

export function useAuxiliaryData(underlyingScrip: number | null, expiry: string | null) {
  const [pcrHistory, setPcrHistory] = useState<PcrHistoryPoint[]>([]);
  const [oiSeries, setOiSeries] = useState<OiTimeSeriesPoint[]>([]);

  useEffect(() => {
    if (!underlyingScrip || !expiry) return;
    let cancelled = false;

    const load = () => {
      api
        .getPcrHistory(underlyingScrip, expiry)
        .then((r) => !cancelled && setPcrHistory(r))
        .catch(() => undefined);
      api
        .getOiTimeSeries(underlyingScrip, expiry)
        .then((r) => !cancelled && setOiSeries(r))
        .catch(() => undefined);
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [underlyingScrip, expiry]);

  return { pcrHistory, oiSeries };
}
