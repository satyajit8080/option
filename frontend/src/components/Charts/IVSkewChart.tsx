import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IvAnalysisResult } from "@/types";
import { formatStrike } from "@/lib/format";

interface Props {
  iv: IvAnalysisResult;
  atmStrike: number;
}

export function IVSkewChart({ iv, atmStrike }: Props) {
  const data = iv.skew.map((p) => ({ strike: p.strike, ce: p.ce_iv, pe: p.pe_iv }));

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">IV Skew</h3>
        <div className="text-right text-xs text-text-faint">
          ATM IV <span className="font-mono text-text-primary tabnum">{iv.atm_iv.toFixed(1)}%</span>
          {iv.iv_rank !== null && (
            <span className="ml-2">
              Rank <span className="font-mono text-text-primary tabnum">{iv.iv_rank.toFixed(0)}</span>
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242B3D" vertical={false} />
          <XAxis dataKey="strike" tickFormatter={(v) => formatStrike(v)} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" width={40} />
          <Tooltip
            contentStyle={{ background: "#181E2E", border: "1px solid #242B3D", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(label) => `Strike ${formatStrike(Number(label))}`}
            formatter={(value: number, name: string) => [`${value?.toFixed(2)}%`, name === "ce" ? "Call IV" : "Put IV"]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => (value === "ce" ? "Call IV" : "Put IV")}
          />
          <ReferenceLine x={atmStrike} stroke="#D4A24E" strokeDasharray="4 3" />
          <Line type="monotone" dataKey="ce" stroke="#2DD4A7" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="pe" stroke="#F2607D" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
