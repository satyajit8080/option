import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PcrHistoryPoint } from "@/types";
import { formatTime } from "@/lib/format";

interface Props {
  history: PcrHistoryPoint[];
}

export function PCRTrendChart({ history }: Props) {
  const data = history.map((p) => ({ time: p.timestamp, pcr: p.pcr }));

  return (
    <div className="panel p-4">
      <h3 className="font-semibold text-sm mb-3">PCR Trend (Today)</h3>
      {data.length < 2 ? (
        <div className="h-[180px] flex items-center justify-center text-text-faint text-sm">
          Collecting intraday readings — check back shortly.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#242B3D" vertical={false} />
            <ReferenceArea y1={0} y2={0.7} fill="#F2607D" fillOpacity={0.06} />
            <ReferenceArea y1={1.3} y2={3} fill="#2DD4A7" fillOpacity={0.06} />
            <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" minTickGap={40} />
            <YAxis tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" width={32} domain={["dataMin - 0.1", "dataMax + 0.1"]} />
            <Tooltip
              contentStyle={{ background: "#181E2E", border: "1px solid #242B3D", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(label) => formatTime(String(label))}
              formatter={(value: number) => [value.toFixed(3), "PCR"]}
            />
            <Line type="monotone" dataKey="pcr" stroke="#D4A24E" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
