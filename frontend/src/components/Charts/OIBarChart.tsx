import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { StrikeRow } from "@/types";
import { formatOi, formatStrike } from "@/lib/format";

interface Props {
  rows: StrikeRow[];
  atmStrike: number;
  strikeWindow?: number;
}

/** Mirrored horizontal OI bars — CE extending left, PE extending right of a
 *  shared strike axis. This is the layout traders already recognise from
 *  Sensibull/Opstra-style OI charts and reads faster than two separate
 *  side-by-side charts when scanning for the biggest walls. */
export function OIBarChart({ rows, atmStrike, strikeWindow = 15 }: Props) {
  const data = useMemo(() => {
    const atmIndex = rows.findIndex((r) => r.strike === atmStrike);
    const windowed = atmIndex === -1 ? rows : rows.slice(Math.max(0, atmIndex - strikeWindow), atmIndex + strikeWindow + 1);
    return windowed.map((r) => ({
      strike: formatStrike(r.strike),
      strikeNum: r.strike,
      ce: r.ce ? -r.ce.oi : 0,
      pe: r.pe ? r.pe.oi : 0,
    }));
  }, [rows, atmStrike, strikeWindow]);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Open Interest by Strike</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-bullish" /> CE OI</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-bearish" /> PE OI</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(320, data.length * 16)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242B3D" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatOi(Math.abs(v))}
            tick={{ fill: "#8B92A8", fontSize: 11 }}
            stroke="#242B3D"
          />
          <YAxis
            dataKey="strike"
            type="category"
            tick={{ fill: "#8B92A8", fontSize: 10 }}
            width={56}
            stroke="#242B3D"
            interval={data.length > 30 ? Math.floor(data.length / 25) : 0}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{ background: "#181E2E", border: "1px solid #242B3D", borderRadius: 8, fontSize: 12 }}
            formatter={(value: number) => formatOi(Math.abs(value))}
            labelFormatter={(label) => `Strike ${label}`}
          />
          <ReferenceLine x={0} stroke="#242B3D" />
          <Bar dataKey="ce" fill="#2DD4A7" radius={[2, 0, 0, 2]} />
          <Bar dataKey="pe" fill="#F2607D" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
