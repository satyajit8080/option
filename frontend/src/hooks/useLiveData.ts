import { useCallback, useEffect, useRef, useState } from "react";
import { OptionChainSocket, type ConnectionStatus } from "@/api/websocket";
import { api } from "@/api/client";
import type { FullChainResponse, Instrument } from "@/types";

interface UseLiveDataOptions {
  instrument: Instrument | null;
  expiry: string | null;
  /** Auto-refresh toggle from the UI. When false, no WS subscription /
   *  polling happens — the last received `data` is simply left in place
   *  until re-enabled or a manual refresh is triggered. */
  enabled?: boolean;
  /** When false, falls back to plain REST polling instead of the WebSocket
   *  (useful as a manual escape hatch, or in environments where WS is
   *  blocked by a corporate proxy). */
  useWebSocket?: boolean;
  pollIntervalMs?: number;
}

interface UseLiveDataResult {
  data: FullChainResponse | null;
  status: ConnectionStatus | "polling" | "paused";
  error: string | null;
  lastUpdated: Date | null;
}

export function useLiveData({
  instrument,
  expiry,
  enabled = true,
  useWebSocket = true,
  pollIntervalMs = 5000,
}: UseLiveDataOptions): UseLiveDataResult {
  const [data, setData] = useState<FullChainResponse | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | "polling" | "paused">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const socketRef = useRef<OptionChainSocket | null>(null);

  // --- WebSocket path -----------------------------------------------------
  useEffect(() => {
    if (!useWebSocket || !instrument || !expiry) return;

    if (!enabled) {
      socketRef.current?.unsubscribe();
      setStatus("paused");
      return;
    }

    if (!socketRef.current) {
      socketRef.current = new OptionChainSocket();
      socketRef.current.connect();
    }
    const socket = socketRef.current;

    const offStatus = socket.onStatusChange(setStatus);
    const offMessage = socket.onMessage((msg) => {
      if (msg.type === "chain_update") {
        setData(msg.data);
        setLastUpdated(new Date());
        setError(null);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    });

    socket.subscribe({
      action: "subscribe",
      underlying_scrip: instrument.underlying_scrip,
      underlying_seg: instrument.underlying_seg,
      expiry,
      label: instrument.label,
    });

    return () => {
      offStatus();
      offMessage();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useWebSocket, enabled, instrument?.underlying_scrip, instrument?.underlying_seg, expiry]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  // --- REST polling fallback ----------------------------------------------
  useEffect(() => {
    if (useWebSocket || !enabled || !instrument || !expiry) {
      if (!enabled) setStatus("paused");
      return;
    }

    let cancelled = false;
    setStatus("polling");

    const tick = async () => {
      try {
        const result = await api.getOptionChain(
          instrument.underlying_scrip,
          instrument.underlying_seg,
          expiry,
          instrument.label,
        );
        if (!cancelled) {
          setData(result);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to fetch option chain");
      }
    };

    tick();
    const interval = setInterval(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [useWebSocket, enabled, instrument, expiry, pollIntervalMs]);

  return { data, status, error, lastUpdated };
}

/** Manual one-shot refresh, exposed separately so the "Refresh now" button
 *  works the same way regardless of whether the live feed is WS or polling. */
export function useManualRefresh(instrument: Instrument | null, expiry: string | null) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (): Promise<FullChainResponse | null> => {
    if (!instrument || !expiry) return null;
    setRefreshing(true);
    try {
      return await api.getOptionChain(
        instrument.underlying_scrip,
        instrument.underlying_seg,
        expiry,
        instrument.label,
      );
    } finally {
      setRefreshing(false);
    }
  }, [instrument, expiry]);

  return { refresh, refreshing };
}
