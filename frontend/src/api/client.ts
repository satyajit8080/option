// Thin REST client. Every method maps 1:1 to a backend route in
// backend/app/routers/*.py — see there for the authoritative contract.
import type {
  BriefResponse,
  ExpiryListResponse,
  FullChainResponse,
  Instrument,
  OiTimeSeriesPoint,
  PcrHistoryPoint,
  PriceOiOverlayResponse,
  SnapshotListResponse,
  UnderlyingSeg,
} from "@/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* response wasn't JSON — keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getIndices: () => request<Instrument[]>("/api/instruments/indices"),

  searchStocks: (query: string) => request<Instrument[]>("/api/instruments/search", { q: query }),

  getExpiries: (underlyingScrip: number, underlyingSeg: UnderlyingSeg) =>
    request<ExpiryListResponse>(`/api/instruments/${underlyingScrip}/expiries`, {
      underlying_seg: underlyingSeg,
    }),

  getOptionChain: (underlyingScrip: number, underlyingSeg: UnderlyingSeg, expiry: string, label: string) =>
    request<FullChainResponse>("/api/option-chain", {
      underlying_scrip: underlyingScrip,
      underlying_seg: underlyingSeg,
      expiry,
      label,
    }),

  getIntradayBaselineChain: (
    underlyingScrip: number,
    underlyingSeg: UnderlyingSeg,
    expiry: string,
    label: string,
    baselineTimestamp: string,
  ) =>
    request<FullChainResponse>("/api/option-chain/intraday-baseline", {
      underlying_scrip: underlyingScrip,
      underlying_seg: underlyingSeg,
      expiry,
      label,
      baseline_timestamp: baselineTimestamp,
    }),

  getSnapshots: (underlyingScrip: number, expiry: string) =>
    request<SnapshotListResponse>(`/api/snapshots/${underlyingScrip}/${expiry}`),

  getPcrHistory: (underlyingScrip: number, expiry: string) =>
    request<PcrHistoryPoint[]>(`/api/snapshots/${underlyingScrip}/${expiry}/pcr-history`),

  getOiTimeSeries: (underlyingScrip: number, expiry: string) =>
    request<OiTimeSeriesPoint[]>(`/api/snapshots/${underlyingScrip}/${expiry}/oi-time-series`),

  getIntradayWithOi: (params: {
    securityId: string;
    exchangeSegment: string;
    instrument: string;
    interval: string;
    fromDate: string;
    toDate: string;
    underlyingScrip: number;
    expiry: string;
  }) =>
    request<PriceOiOverlayResponse>("/api/charts/intraday-with-oi", {
      security_id: params.securityId,
      exchange_segment: params.exchangeSegment,
      instrument: params.instrument,
      interval: params.interval,
      from_date: params.fromDate,
      to_date: params.toDate,
      underlying_scrip: params.underlyingScrip,
      expiry: params.expiry,
    }),

  getBrief: (underlyingScrip: number, underlyingSeg: UnderlyingSeg, expiry: string, label: string) =>
    request<BriefResponse>("/api/brief", {
      underlying_scrip: underlyingScrip,
      underlying_seg: underlyingSeg,
      expiry,
      label,
    }),
};

export { ApiError };
