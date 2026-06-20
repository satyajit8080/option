import { SimpleVerdict } from "@/components/SimpleView/SimpleVerdict";
import { SummaryTable } from "@/components/SimpleView/SummaryTable";
import { SimpleChainTable } from "@/components/SimpleView/SimpleChainTable";
import { PuttingItTogether } from "@/components/SimpleView/PuttingItTogether";
import { AIBrief } from "@/components/SimpleView/AIBrief";
import { TickerBar, StatusBanners } from "@/components/Layout/TickerBar";
import type { DashboardData } from "@/hooks/useDashboardData";

interface Props {
  d: DashboardData;
  onSwitchToAdvanced: () => void;
}

/** The new default, beginner-friendly view: one plain-language verdict, a
 *  summary table of every indicator, a simplified option chain, and a
 *  "putting it together" recap. All bound to the same live FullChainResponse
 *  the advanced view uses (via the shared useDashboardData hook). */
export function SimpleDashboard({ d, onSwitchToAdvanced }: Props) {
  const data = d.data;

  return (
    <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 py-4 space-y-4">
      <TickerBar d={d} />
      <StatusBanners d={d} />

      {data && (
        <>
          <SimpleVerdict data={data} />

          <div className="banner-info flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-warn-soft border border-warn/30 text-[13px] text-warn">
            <span className="shrink-0">ℹ️</span>
            <span>
              <b className="text-text-primary">Not a buy/sell tip.</b> OptionScope explains what the options data shows so{" "}
              <i>you</i> can decide. It never tells you to trade.
            </span>
          </div>

          <SummaryTable data={data} />
          <SimpleChainTable data={data} onShowFull={onSwitchToAdvanced} />
          <AIBrief instrument={d.selectedInstrument} expiry={d.selectedExpiry} />
          <PuttingItTogether data={data} />
        </>
      )}
    </main>
  );
}
