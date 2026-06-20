import type { FullChainResponse } from "@/types";
import { buildVerdictLine } from "@/lib/signals";

interface Props {
  data: FullChainResponse;
}

/** The closing "what does it all mean" table. Derived from the same real
 *  verdict + walls used everywhere else in the simple view. Strictly
 *  observational — never says buy/sell. */
export function PuttingItTogether({ data }: Props) {
  const v = buildVerdictLine(data);
  const { analytics } = data;

  const lean =
    v.signal === "neutral"
      ? "No clear direction right now — signals are mixed or flat."
      : `Mildly ${v.signal === "green" ? "up" : "down"} — based on PCR, Max Pain and OI walls. A tilt, not a strong trend.`;

  const range =
    v.rangeLow !== null && v.rangeHigh !== null
      ? `${v.rangeLow.toLocaleString("en-IN")} floor and ${v.rangeHigh.toLocaleString("en-IN")} ceiling are the nearest strong barriers. Expect movement between them.`
      : "No strong nearby barriers detected in the current strike window.";

  const watch =
    v.rangeLow !== null && v.rangeHigh !== null
      ? `A break above ${v.rangeHigh.toLocaleString("en-IN")} turns the tone up; a break below ${v.rangeLow.toLocaleString("en-IN")} turns it down.`
      : "Watch for price moving decisively out of its recent range.";

  void analytics;

  const rows: [string, string][] = [
    ["The lean", lean],
    ["The range", range],
    ["Watch for", watch],
  ];

  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wider text-text-faint mb-2.5">Putting it together</div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([label, text], i) => (
            <tr key={label} className={i < rows.length - 1 ? "border-b border-surface-border/50" : ""}>
              <td className="w-[140px] font-semibold text-text-primary py-2.5 align-top">{label}</td>
              <td className="text-[13px] text-text-faint leading-snug py-2.5">{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
