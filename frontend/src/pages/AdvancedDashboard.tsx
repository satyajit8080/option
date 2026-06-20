import { useState } from "react";
import { SentimentPanel } from "@/components/SentimentPanel/SentimentPanel";
import { GreeksSummaryCards } from "@/components/GreeksCards/GreeksSummaryCards";
import { OptionChainTable } from "@/components/OptionChainTable/OptionChainTable";
import { PCRGauge } from "@/components/Charts/PCRGauge";
import { SupportResistancePanel } from "@/components/Panels/SupportResistancePanel";
import { UnusualOiAlerts } from "@/components/Panels/UnusualOiAlerts";
import { OIBarChart } from "@/components/Charts/OIBarChart";
import { MaxPainChart } from "@/components/Charts/MaxPainChart";
import { OIHeatmap } from "@/components/Charts/OIHeatmap";
import { OITimeSeriesChart } from "@/components/Charts/OITimeSeriesChart";
import { PCRTrendChart } from "@/components/Charts/PCRTrendChart";
import { IVSkewChart } from "@/components/Charts/IVSkewChart";
import { CandlestickOIChart } from "@/components/Charts/CandlestickOIChart";
import { AIBrief } from "@/components/SimpleView/AIBrief";
import { TickerBar, StatusBanners } from "@/components/Layout/TickerBar";
import type { DashboardData } from "@/hooks/useDashboardData";

interface Props {
  d: DashboardData;
}

type TabKey = "overview" | "oi-trends" | "volatility" | "price-action";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "oi-trends", label: "OI Trends" },
  { key: "volatility", label: "Volatility & Greeks" },
  { key: "price-action", label: "Price Action" },
];

/** The full, dense professional view — unchanged in behaviour from the
 *  original Dashboard. Now receives its data via props (from the shared
 *  useDashboardData hook) instead of calling the data hooks itself. */
export function AdvancedDashboard({ d }: Props) {
  const [strikeWindow, setStrikeWindow] = useState<number | null>(20);
  const [tab, setTab] = useState<TabKey>("overview");

  const chain = d.data?.chain;
  const analytics = d.data?.analytics;

  return (
    <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-4 space-y-4">
      <TickerBar d={d} />
      <StatusBanners d={d} />

      {analytics && <SentimentPanel sentiment={analytics.sentiment} />}
      {analytics && <GreeksSummaryCards greeks={analytics.greeks} />}

      {chain && analytics && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
          <div className="h-[640px]">
            <OptionChainTable
              rows={chain.rows}
              atmStrike={chain.atm_strike}
              strikeWindow={strikeWindow}
              onStrikeWindowChange={setStrikeWindow}
            />
          </div>
          <div className="space-y-4">
            <PCRGauge pcr={analytics.pcr} />
            <SupportResistancePanel data={analytics.support_resistance} />
            <UnusualOiAlerts alerts={analytics.unusual_oi} />
          </div>
        </div>
      )}

      {chain && analytics && <AIBrief instrument={d.selectedInstrument} expiry={d.selectedExpiry} />}

      {chain && analytics && (
        <div className="space-y-4">
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-accent text-bg" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <OIBarChart rows={chain.rows} atmStrike={chain.atm_strike} />
              <MaxPainChart maxPain={analytics.max_pain} />
            </div>
          )}

          {tab === "oi-trends" && (
            <div className="space-y-4">
              <OIHeatmap rows={chain.rows} atmStrike={chain.atm_strike} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <OITimeSeriesChart series={d.oiSeries} />
                <PCRTrendChart history={d.pcrHistory} />
              </div>
            </div>
          )}

          {tab === "volatility" && (
            <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
              <IVSkewChart iv={analytics.iv} atmStrike={chain.atm_strike} />
            </div>
          )}

          {tab === "price-action" && (
            <CandlestickOIChart instrument={d.selectedInstrument} expiry={d.selectedExpiry} />
          )}
        </div>
      )}
    </main>
  );
}
