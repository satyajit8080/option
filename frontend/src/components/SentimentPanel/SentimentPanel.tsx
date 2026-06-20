import type { SentimentSummary } from "@/types";
import { sentimentBg, sentimentColor } from "@/lib/format";

interface Props {
  sentiment: SentimentSummary;
}

const LABEL_TEXT: Record<SentimentSummary["label"], string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
  sideways: "Sideways / Mixed",
};

const LEANING_DOT: Record<string, string> = {
  bullish: "bg-bullish",
  bearish: "bg-bearish",
  neutral: "bg-text-faint",
  sideways: "bg-warn",
};

export function SentimentPanel({ sentiment }: Props) {
  return (
    <div className={`panel border ${sentimentBg[sentiment.label]}`}>
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 sm:min-w-[200px]">
          <div className={`text-2xl font-bold ${sentimentColor[sentiment.label]}`}>{LABEL_TEXT[sentiment.label]}</div>
          <div className="text-xs text-text-faint">
            Signal agreement
            <div className="w-20 h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden">
              <div
                className={`h-full ${sentimentColor[sentiment.label].replace("text-", "bg-")}`}
                style={{ width: `${Math.round(sentiment.confidence * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-wrap gap-x-5 gap-y-1.5">
          {sentiment.factors.map((f) => (
            <div key={f.name} className="flex items-start gap-1.5 text-xs">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${LEANING_DOT[f.leaning]}`} />
              <span>
                <span className="text-text-muted font-medium">{f.name}:</span>{" "}
                <span className="text-text-faint">{f.observation}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 pb-3 text-[11px] text-text-faint border-t border-surface-border/60 pt-2">
        {sentiment.disclaimer}
      </div>
    </div>
  );
}
