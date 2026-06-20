import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { api } from "@/api/client";
import type { Instrument } from "@/types";

interface Props {
  instrument: Instrument | null;
  expiry: string | null;
}

function todayRangeIST(): { fromDate: string; toDate: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return { fromDate: `${dateStr} 09:15:00`, toDate: `${dateStr} 15:30:00` };
}

/** Underlying price candles (Dhan Intraday Historical Data) with total
 *  chain OI plotted as a secondary-axis overlay line. Self-fetches on
 *  mount/instrument-change rather than taking data as props, since it
 *  needs its own date-range request independent of the live chain poll. */
export function CandlestickOIChart({ instrument, expiry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const oiCeSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const oiPeSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart lifecycle — created once, destroyed on unmount.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8B92A8" },
      grid: { vertLines: { color: "#242B3D" }, horzLines: { color: "#242B3D" } },
      rightPriceScale: { borderColor: "#242B3D" },
      timeScale: { borderColor: "#242B3D", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      height: 360,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#2DD4A7",
      downColor: "#F2607D",
      borderVisible: false,
      wickUpColor: "#2DD4A7",
      wickDownColor: "#F2607D",
    });

    const oiCeSeries = chart.addLineSeries({
      color: "#2DD4A7",
      lineWidth: 1,
      priceScaleId: "oi",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const oiPeSeries = chart.addLineSeries({
      color: "#F2607D",
      lineWidth: 1,
      priceScaleId: "oi",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("oi").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    oiCeSeriesRef.current = oiCeSeries;
    oiPeSeriesRef.current = oiPeSeries;

    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Data fetch — re-runs when instrument/expiry changes.
  useEffect(() => {
    if (!instrument || !expiry) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { fromDate, toDate } = todayRangeIST();
    api
      .getIntradayWithOi({
        securityId: String(instrument.underlying_scrip),
        exchangeSegment: instrument.underlying_seg,
        instrument: instrument.kind === "index" ? "INDEX" : "EQUITY",
        interval: "5",
        fromDate,
        toDate,
        underlyingScrip: instrument.underlying_scrip,
        expiry,
      })
      .then((res) => {
        if (cancelled) return;
        const { candles, oi_series } = res;

        const candleData = candles.timestamp.map((t, i) => ({
          time: t as UTCTimestamp,
          open: candles.open[i],
          high: candles.high[i],
          low: candles.low[i],
          close: candles.close[i],
        }));
        candleSeriesRef.current?.setData(candleData);

        const oiCeData = oi_series.map((p) => ({ time: Math.floor(p.timestamp) as UTCTimestamp, value: p.total_ce_oi }));
        const oiPeData = oi_series.map((p) => ({ time: Math.floor(p.timestamp) as UTCTimestamp, value: p.total_pe_oi }));
        oiCeSeriesRef.current?.setData(oiCeData);
        oiPeSeriesRef.current?.setData(oiPeData);

        chartRef.current?.timeScale().fitContent();
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load chart data");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument?.underlying_scrip, instrument?.underlying_seg, instrument?.kind, expiry]);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Price with OI Overlay</h3>
        <div className="flex items-center gap-3 text-xs text-text-faint">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-bullish inline-block" /> CE OI</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-bearish inline-block" /> PE OI</span>
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60 text-text-faint text-sm">
            Loading intraday candles…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-bearish text-xs px-4 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
