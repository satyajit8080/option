import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { Instrument } from "@/types";

interface Props {
  indices: Instrument[];
  selected: Instrument | null;
  onSelect: (i: Instrument) => void;
}

/** Combobox-style picker: quick-select chips for the major indices, plus a
 *  type-ahead search box for individual stock options (debounced, hits
 *  `/api/instruments/search` which is backed by Dhan's scrip master). */
export function InstrumentSelector({ indices, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      api
        .searchStocks(query.trim())
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1.5">
        {indices.slice(0, 4).map((idx) => (
          <button
            key={idx.label}
            onClick={() => {
              onSelect(idx);
              setOpen(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              selected?.underlying_scrip === idx.underlying_scrip
                ? "bg-accent text-bg"
                : "bg-surface-2 text-text-muted hover:text-text-primary hover:bg-surface-border"
            }`}
          >
            {idx.label}
          </button>
        ))}

        <div className="relative">
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder="Search stock…"
            aria-label="Search for a stock by symbol"
            className="w-36 sm:w-44 bg-surface-2 border border-surface-border rounded-lg px-3 py-1.5 text-sm placeholder:text-text-faint focus:w-56 transition-all outline-none"
          />
        </div>
      </div>

      {open && (query.trim().length >= 2 || results.length > 0) && (
        <div className="absolute z-30 mt-2 right-0 w-72 panel max-h-80 overflow-y-auto scrollbar-thin">
          {searching && <div className="px-3 py-2 text-sm text-text-faint">Searching…</div>}
          {!searching && results.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-2 text-sm text-text-faint">No matches. Try the exact NSE symbol.</div>
          )}
          {results.map((r) => (
            <button
              key={`${r.underlying_seg}-${r.underlying_scrip}`}
              onClick={() => {
                onSelect(r);
                setQuery("");
                setResults([]);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 flex items-center justify-between"
            >
              <span className="font-medium">{r.label}</span>
              <span className="text-text-faint text-xs">{r.underlying_seg}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
