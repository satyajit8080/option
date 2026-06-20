import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MaxPainResult } from "@/types";
import { formatOi, formatPct, formatStrike } from "@/lib/format";

interface Props {
  maxPain: MaxPainResult;
}

export function MaxPainChart({ maxPain }: Props) {
  const data = maxPain.curve.map((p) => ({ strike: p.strike, pain: p.total_pain }));
  const maxPainPoint = data.find((d) => d.strike === maxPain.max_pain_strike);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Max Pain</h3>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold text-accent tabnum">{formatStrike(maxPain.max_pain_strike)}</div>
        </div>
      </div>
      <p className="text-xs text-text-faint mb-3">
        Spot is {formatPct(maxPain.distance_pct)} ({maxPain.distance_points >= 0 ? "+" : ""}
        {maxPain.distance_points.toFixed(0)} pts) {maxPain.distance_points >= 0 ? "above" : "below"} the strike where
        aggregate option-writer loss would be lowest at expiry.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="painGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4A24E" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#D4A24E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#242B3D" vertical={false} />
          <XAxis dataKey="strike" tickFormatter={(v) => formatStrike(v)} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" />
          <YAxis tickFormatter={(v) => formatOi(v)} tick={{ fill: "#8B92A8", fontSize: 10 }} stroke="#242B3D" width={48} />
          <Tooltip
            contentStyle={{ background: "#181E2E", border: "1px solid #242B3D", borderRadius: 8, fontSize: 12 }}
            formatter={(value: number) => [formatOi(value), "Aggregate writer pain"]}
            labelFormatter={(label) => `Strike ${formatStrike(Number(label))}`}
          />
          <Area type="monotone" dataKey="pain" stroke="#D4A24E" strokeWidth={2} fill="url(#painGradient)" />
          {maxPainPoint && (
            <ReferenceDot x={maxPainPoint.strike} y={maxPainPoint.pain} r={5} fill="#D4A24E" stroke="#0A0D13" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
