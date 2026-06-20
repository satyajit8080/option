import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { BriefResponse, Instrument } from "@/types";

// Poll cadence. The backend only calls the LLM "as the market changes"
// (with a floor between calls), so most of these polls return the cached
// brief cheaply — this interval just controls how quickly the UI picks up a
// newly-regenerated brief, not how often the LLM actually runs.
const POLL_MS = 90_000;

export function useMarketBrief(instrument: Instrument | null, expiry: string | null) {
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!instrument || !expiry) return;
    let cancelled = false;

    const load = (first: boolean) => {
      if (first) setLoading(true);
      api
        .getBrief(instrument.underlying_scrip, instrument.underlying_seg, expiry, instrument.label)
        .then((res) => {
          if (cancelled) return;
          setBrief(res);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load brief");
        })
        .finally(() => {
          if (!cancelled && first) setLoading(false);
        });
    };

    load(true);
    const interval = setInterval(() => load(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument?.underlying_scrip, instrument?.underlying_seg, expiry]);

  return { brief, loading, error };
}
