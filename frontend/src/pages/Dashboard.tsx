import { useState } from "react";
import { Header } from "@/components/Layout/Header";
import { Footer } from "@/components/Layout/Footer";
import { SimpleDashboard } from "@/pages/SimpleDashboard";
import { AdvancedDashboard } from "@/pages/AdvancedDashboard";
import { useDashboardData } from "@/hooks/useDashboardData";

type ViewMode = "simple" | "advanced";

/**
 * Thin host component:
 *  - calls useDashboardData() ONCE (one WebSocket subscription, shared by both views)
 *  - renders the Header + a Simple/Advanced view toggle
 *  - switches between the beginner-friendly SimpleDashboard (default) and the
 *    full AdvancedDashboard (the original dense view, unchanged in behaviour).
 *
 * Both views consume the exact same live data, so toggling never re-fetches
 * or re-subscribes.
 */
export function Dashboard() {
  const d = useDashboardData();
  const [view, setView] = useState<ViewMode>("simple");

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        indices={d.indices}
        selectedInstrument={d.selectedInstrument}
        onSelectInstrument={d.setSelectedInstrument}
        expiries={d.expiries}
        selectedExpiry={d.selectedExpiry}
        onSelectExpiry={d.setSelectedExpiry}
        loadingExpiries={d.loadingExpiries}
        autoRefresh={d.autoRefresh}
        onToggleAutoRefresh={d.setAutoRefresh}
        refreshIntervalMs={d.refreshIntervalMs}
        onIntervalChange={d.setRefreshIntervalMs}
        connectionStatus={d.status}
      />

      {/* View toggle: Simple (default) vs Advanced */}
      <div className="max-w-[1600px] w-full mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1 w-fit">
          <button
            onClick={() => setView("simple")}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "simple" ? "bg-accent text-bg" : "text-text-muted hover:text-text-primary"
            }`}
          >
            Simple
          </button>
          <button
            onClick={() => setView("advanced")}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "advanced" ? "bg-accent text-bg" : "text-text-muted hover:text-text-primary"
            }`}
          >
            ⚙ Advanced
          </button>
        </div>
      </div>

      {view === "simple" ? (
        <SimpleDashboard d={d} onSwitchToAdvanced={() => setView("advanced")} />
      ) : (
        <AdvancedDashboard d={d} />
      )}

      <Footer />
    </div>
  );
}
