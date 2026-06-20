import type { GreeksAggregate } from "@/types";
import { formatOi } from "@/lib/format";

interface Props {
  greeks: GreeksAggregate;
}

const BIAS_COPY: Record<GreeksAggregate["market_maker_bias"], { label: string; tone: string }> = {
  short_gamma: { label: "Gamma concentrated near ATM", tone: "text-warn" },
  long_gamma: { label: "Gamma spread away from ATM", tone: "text-text-muted" },
  neutral: { label: "Gamma evenly distributed", tone: "text-text-muted" },
};

function Card({ label, value, sub, tone, tooltip }: { label: string; value: string; sub?: string; tone?: string; tooltip: string }) {
  return (
    <div className="panel p-3.5 group relative">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-faint">
        {label}
        <InfoDot tooltip={tooltip} />
      </div>
      <div className={`mt-1 text-xl font-mono font-semibold tabnum ${tone ?? "text-text-primary"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-faint">{sub}</div>}
    </div>
  );
}

function InfoDot({ tooltip }: { tooltip: string }) {
  return (
    <span className="relative inline-flex">
      <span tabIndex={0} className="w-3.5 h-3.5 rounded-full border border-text-faint/50 text-[9px] flex items-center justify-center cursor-help text-text-faint">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded-md bg-surface-2 border border-surface-border text-text-muted text-[11px] normal-case tracking-normal px-2 py-1.5 opacity-0 group-hover:opacity-100 peer-focus:opacity-100 transition-opacity z-20">
        {tooltip}
      </span>
    </span>
  );
}

export function GreeksSummaryCards({ greeks }: Props) {
  const bias = BIAS_COPY[greeks.market_maker_bias];
  const deltaTone = greeks.net_delta > 0 ? "text-bullish" : greeks.net_delta < 0 ? "text-bearish" : undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Card
        label="Net Delta"
        value={formatOi(greeks.net_delta)}
        sub="CE − PE, OI-weighted"
        tone={deltaTone}
        tooltip="Sum of (delta × OI) across all calls minus all puts. A rough read on which direction the chain's aggregate option exposure leans."
      />
      <Card
        label="Total Gamma"
        value={formatOi(greeks.total_gamma)}
        sub={bias.label}
        tone={bias.tone}
        tooltip="OI-weighted gamma summed across the chain. Higher values concentrated near the ATM strike can mean dealer hedging flow has more potential to amplify moves — a rough proxy, not a verified positioning read."
      />
      <Card
        label="Total Theta"
        value={formatOi(greeks.total_theta)}
        sub="Daily decay, OI-weighted"
        tooltip="Sum of (theta × OI) across the chain — the aggregate daily time-decay value embedded in current open interest."
      />
      <Card
        label="Total Vega"
        value={formatOi(greeks.total_vega)}
        sub="Per 1% IV move"
        tooltip="Sum of (vega × OI) across the chain — how much aggregate option value would shift for a 1-point change in implied volatility."
      />
      <Card
        label="CE / PE Delta Split"
        value={`${formatOi(greeks.total_ce_delta)} / ${formatOi(greeks.total_pe_delta)}`}
        sub="Call vs. put exposure"
        tooltip="OI-weighted delta totals for calls and puts shown separately, before netting."
      />
    </div>
  );
}
