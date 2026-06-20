import { InstrumentSelector } from "@/components/Controls/InstrumentSelector";
import { ExpirySelector } from "@/components/Controls/ExpirySelector";
import { AutoRefreshToggle } from "@/components/Controls/AutoRefreshToggle";
import type { Instrument } from "@/types";
import type { ConnectionStatus } from "@/api/websocket";

interface Props {
  indices: Instrument[];
  selectedInstrument: Instrument | null;
  onSelectInstrument: (i: Instrument) => void;
  expiries: string[];
  selectedExpiry: string | null;
  onSelectExpiry: (e: string) => void;
  loadingExpiries: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: (v: boolean) => void;
  refreshIntervalMs: number;
  onIntervalChange: (ms: number) => void;
  connectionStatus: ConnectionStatus | "polling" | "paused";
}

const STATUS_META: Record<string, { label: string; dot: string }> = {
  open: { label: "Live", dot: "bg-bullish animate-pulse" },
  polling: { label: "Polling", dot: "bg-accent" },
  connecting: { label: "Connecting…", dot: "bg-warn animate-pulse" },
  reconnecting: { label: "Reconnecting…", dot: "bg-warn animate-pulse" },
  closed: { label: "Disconnected", dot: "bg-bearish" },
  paused: { label: "Paused", dot: "bg-text-faint" },
};

export function Header(props: Props) {
  const statusMeta = STATUS_META[props.connectionStatus] ?? STATUS_META.connecting;

  return (
    <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-surface-border">
      <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
              <span className="text-accent font-mono font-bold text-sm">Ω</span>
            </div>
            <span className="font-semibold tracking-tight text-text-primary hidden sm:inline">OptionScope</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 pl-2 ml-1 border-l border-surface-border">
            <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
            <span className="text-xs text-text-muted">{statusMeta.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <InstrumentSelector
            indices={props.indices}
            selected={props.selectedInstrument}
            onSelect={props.onSelectInstrument}
          />
          <ExpirySelector
            expiries={props.expiries}
            selected={props.selectedExpiry}
            onSelect={props.onSelectExpiry}
            loading={props.loadingExpiries}
          />
          <div className="hidden lg:block">
            <AutoRefreshToggle
              enabled={props.autoRefresh}
              onToggle={props.onToggleAutoRefresh}
              intervalMs={props.refreshIntervalMs}
              onIntervalChange={props.onIntervalChange}
            />
          </div>
        </div>
      </div>

      <div className="lg:hidden max-w-[1600px] mx-auto px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
          <span className="text-xs text-text-muted">{statusMeta.label}</span>
        </div>
        <AutoRefreshToggle
          enabled={props.autoRefresh}
          onToggle={props.onToggleAutoRefresh}
          intervalMs={props.refreshIntervalMs}
          onIntervalChange={props.onIntervalChange}
        />
      </div>
    </header>
  );
}
