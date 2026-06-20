import type { FullChainResponse } from "@/types";
import { buildSummaryRows } from "@/lib/signals";
import { signalTagClass } from "./signalStyles";

interface Props {
  data: FullChainResponse;
}

/** Top "what each indicator says" table. All rows are derived from real data
 *  via buildSummaryRows() — PCR/zone, Max Pain/distance, and the OI walls all
 *  come straight from the existing analytics payload. */
export function SummaryTable({ data }: Props) {
  const rows = buildSummaryRows(data);

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-faint mb-2">
        Summary — what each indicator says
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-faint font-semibold px-4 py-3 border-b border-surface-border bg-surface-2/50 w-[200px]">
                Indicator
              </th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-faint font-semibold px-4 py-3 border-b border-surface-border bg-surface-2/50 w-[120px]">
                Value
              </th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-faint font-semibold px-4 py-3 border-b border-surface-border bg-surface-2/50 w-[130px]">
                Signal
              </th>
              <th className="text-left text-[11px] uppercase tracking-wide text-text-faint font-semibold px-4 py-3 border-b border-surface-border bg-surface-2/50">
                What it means
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.indicator} className="border-b border-surface-border/50 last:border-0">
                <td className="px-4 py-3 align-middle font-semibold">
                  {row.indicator}
                  {row.hint && <span className="text-text-faint font-normal"> {row.hint}</span>}
                </td>
                <td className="px-4 py-3 align-middle font-mono tabnum">{row.value}</td>
                <td className="px-4 py-3 align-middle">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${signalTagClass[row.signal]}`}>
                    {row.signalLabel}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-[13px] text-text-faint leading-snug">{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
