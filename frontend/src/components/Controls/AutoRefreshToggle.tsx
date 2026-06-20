interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  intervalMs: number;
  onIntervalChange: (ms: number) => void;
}

const INTERVALS = [
  { label: "Live", value: 0 },
  { label: "30s", value: 30000 },
  { label: "60s", value: 60000 },
];

export function AutoRefreshToggle({ enabled, onToggle, intervalMs, onIntervalChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className={`relative w-10 h-[22px] rounded-full transition-colors ${enabled ? "bg-accent" : "bg-surface-border"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-bg transition-transform ${
            enabled ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-sm text-text-muted hidden sm:inline">Auto-refresh</span>

      {enabled && (
        <div className="flex items-center gap-1 ml-1 bg-surface-2 rounded-lg p-0.5">
          {INTERVALS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onIntervalChange(opt.value)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                intervalMs === opt.value ? "bg-accent text-bg" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
