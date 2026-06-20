interface Props {
  expiries: string[];
  selected: string | null;
  onSelect: (expiry: string) => void;
  loading?: boolean;
}

function formatExpiryLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export function ExpirySelector({ expiries, selected, onSelect, loading }: Props) {
  return (
    <div className="relative">
      <select
        aria-label="Select expiry date"
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        disabled={loading || expiries.length === 0}
        className="appearance-none bg-surface-2 border border-surface-border rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium outline-none disabled:opacity-50 cursor-pointer"
      >
        {loading && <option>Loading…</option>}
        {!loading &&
          expiries.map((e) => (
            <option key={e} value={e}>
              {formatExpiryLabel(e)}
            </option>
          ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
