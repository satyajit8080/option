import type { FullChainResponse } from "@/types";
import { buildVerdictLine } from "@/lib/signals";
import { signalEmoji, signalText, signalBorder, signalGradient } from "./signalStyles";

interface Props {
  data: FullChainResponse;
}

/** The big plain-language "traffic light" verdict at the top of the simple
 *  view. Every value comes from buildVerdictLine(), which reads only the real
 *  FullChainResponse — nothing here is hardcoded. */
export function SimpleVerdict({ data }: Props) {
  const v = buildVerdictLine(data);

  return (
    <div
      className={`panel flex flex-wrap items-center gap-5 px-5 py-4 border ${signalBorder[v.signal]}`}
      style={{ background: signalGradient[v.signal] }}
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 bg-surface-2 border border-surface-border">
        {signalEmoji[v.signal]}
      </div>
      <div className="flex-1 min-w-[240px]">
        <div className="text-[11px] uppercase tracking-wider text-text-faint mb-1.5">Overall signal</div>
        <div className={`text-3xl font-extrabold leading-none ${signalText[v.signal]}`}>{v.word}</div>
        <div className="text-sm text-text-muted mt-1.5 max-w-[640px] leading-relaxed">{v.line}</div>
        {v.agreeText && <div className="text-[11px] text-text-faint mt-1.5">Signal strength: {v.agreeText}</div>}
      </div>
    </div>
  );
}
