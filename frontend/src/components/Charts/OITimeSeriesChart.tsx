import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OiTimeSeriesPoint } from "@/types";
import { formatOi } from "@/lib/format";

interface Props {
  series: OiTimeSeriesPoint[];
}

function formatEpoch(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** Cumulative total CE/PE OI across the whole chain, sampled at every
 *  intraday snapshot captured by the poller — shows the session's overall
 *  buildup/unwinding arc at a glance, independent of any single strike. */
export function OITimeSeriesChart({ series }: Props) {
  const data = series.map((p) => ({ time: p.timestamp, ce: p.total_ce_oi, pe: p.total_pe_oi }));

  return (
    <div className="panel p-4">
      <h3 className="font-semibold text-sm mb-3">Intraday OI Trend</h3>
      {data.length < 2 ? (
        <div className="h-[200px] flex items-center justify-center text-text-faint text-sm">
          Collecting intraday snapshots — this fills in as the session progresses.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="ceOiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2DD4A7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#2DD4A7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="peOiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F2607D" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F2607D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#242B3D" vertical={false} />
            <XAxis dataKey="time" tickFormatter={formatEpoch} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" minTickGap={40} />
            <YAxis tickFormatter={(v) => formatOi(v)} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" width={44} />
            <Tooltip
              contentStyle={{ background: "#181E2E", border: "1px solid #242B3D", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(label) => formatEpoch(Number(label))}
              formatter={(value: number, name: string) => [formatOi(value), name === "ce" ? "Total CE OI" : "Total PE OI"]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "ce" ? "Total CE OI" : "Total PE OI")} />
            <Area type="monotone" dataKey="ce" stroke="#2DD4A7" strokeWidth={2} fill="url(#ceOiGradient)" />
            <Area type="monotone" dataKey="pe" stroke="#F2607D" strokeWidth={2} fill="url(#peOiGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
