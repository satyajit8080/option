import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Instrument } from "@/types";

interface UseOptionChainSelectionResult {
  indices: Instrument[];
  selectedInstrument: Instrument | null;
  setSelectedInstrument: (i: Instrument) => void;
  expiries: string[];
  selectedExpiry: string | null;
  setSelectedExpiry: (e: string) => void;
  loadingIndices: boolean;
  loadingExpiries: boolean;
  expiriesError: string | null;
}

/** Drives the instrument + expiry selector controls in the header: loads
 *  the known index list on mount, defaults to the first one (NIFTY 50),
 *  and re-fetches the expiry list whenever the selected instrument changes. */
export function useOptionChainSelection(): UseOptionChainSelectionResult {
  const [indices, setIndices] = useState<Instrument[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [loadingIndices, setLoadingIndices] = useState(true);
  const [loadingExpiries, setLoadingExpiries] = useState(false);
  const [expiriesError, setExpiriesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingIndices(true);
    api
      .getIndices()
      .then((list) => {
        if (cancelled) return;
        setIndices(list);
        if (list.length > 0) setSelectedInstrument(list[0]);
      })
      .catch(() => {
        /* surfaced via expiriesError once an instrument is picked; index
           list failures are rare enough that header just stays empty */
      })
      .finally(() => !cancelled && setLoadingIndices(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedInstrument) return;
    let cancelled = false;
    setLoadingExpiries(true);
    setExpiriesError(null);
    api
      .getExpiries(selectedInstrument.underlying_scrip, selectedInstrument.underlying_seg)
      .then((res) => {
        if (cancelled) return;
        setExpiries(res.expiries);
        setSelectedExpiry((prev) => (prev && res.expiries.includes(prev) ? prev : res.expiries[0] ?? null));
      })
      .catch((e) => {
        if (!cancelled) setExpiriesError(e instanceof Error ? e.message : "Failed to load expiries");
      })
      .finally(() => !cancelled && setLoadingExpiries(false));
    return () => {
      cancelled = true;
    };
  }, [selectedInstrument]);

  return {
    indices,
    selectedInstrument,
    setSelectedInstrument,
    expiries,
    selectedExpiry,
    setSelectedExpiry,
    loadingIndices,
    loadingExpiries,
    expiriesError,
  };
}
