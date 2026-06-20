import { useMarketBrief } from "@/hooks/useMarketBrief";
import { isBriefAvailable } from "@/types";
import type { Instrument } from "@/types";

interface Props {
  instrument: Instrument | null;
  expiry: string | null;
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/** AI-generated market brief, shown below the option chain. Polls the
 *  /api/brief endpoint; the backend regenerates the LLM text only as the
 *  market materially changes, so this stays cheap. Strictly observational —
 *  the backend guard guarantees no buy/sell language reaches here. */
export function AIBrief({ instrument, expiry }: Props) {
  const { brief, loading, error } = useMarketBrief(instrument, expiry);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-2/40">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center text-[11px]">
            ✨
          </span>
          <h3 className="font-semibold text-sm">AI Market Brief</h3>
        </div>
        {brief && isBriefAvailable(brief) && (
          <div className="flex items-center gap-2 text-[11px] text-text-faint">
            {brief.is_stale && <span className="text-warn">stale</span>}
            <span>as of {timeAgo(brief.generated_at)}</span>
          </div>
        )}
      </div>

      <div className="p-4">
        {loading && !brief && (
          <div className="text-sm text-text-faint">Generating market brief…</div>
        )}

        {error && !brief && (
          <div className="text-sm text-text-faint">
            Brief unavailable right now. The dashboard data above is unaffected.
          </div>
        )}

        {brief && !isBriefAvailable(brief) && (
          <div className="text-sm text-text-faint">
            {brief.reason}
          </div>
        )}

        {brief && isBriefAvailable(brief) && (
          <>
            <p className="text-[15px] font-semibold text-text-primary mb-3">{brief.headline}</p>
            <ul className="space-y-2">
              {brief.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-text-muted">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t border-surface-border/60 flex items-center justify-between gap-3">
              <span className="text-[11px] text-text-faint leading-relaxed">{brief.disclaimer}</span>
              <span className="text-[10px] text-text-faint shrink-0 font-mono">{briefModelLabel(brief.model)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function briefModelLabel(model: string): string {
  // Show just the model name, not the full provider path.
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}
