import type { PcrResult } from "@/types";
import { pcrZoneColor } from "@/lib/format";

interface Props {
  pcr: PcrResult;
}

const GAUGE_MIN = 0;
const GAUGE_MAX = 2.2;

const ZONE_LABEL: Record<PcrResult["zone"], string> = {
  bearish: "Bearish zone",
  neutral: "Neutral zone",
  bullish: "Bullish zone",
};

/** Hand-rolled semicircular speedometer — avoids pulling in a whole gauge
 *  library for one widget. Needle angle maps PCR linearly across the
 *  bearish/neutral/bullish bands defined in the analytics engine. */
export function PCRGauge({ pcr }: Props) {
  const clamped = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, pcr.overall_pcr));
  const fraction = (clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  const angleDeg = -90 + fraction * 180; // -90 (left) .. +90 (right)
  const angleRad = (angleDeg * Math.PI) / 180;

  const cx = 100;
  const cy = 92;
  const r = 78;
  const needleX = cx + r * 0.82 * Math.sin(angleRad);
  const needleY = cy - r * 0.82 * Math.cos(angleRad);

  // Zone boundaries on the same 0..GAUGE_MAX scale as the needle.
  const bearishEnd = (0.7 - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  const bullishStart = (1.3 - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);

  const arcPath = (startFrac: number, endFrac: number) => {
    const a0 = -90 + startFrac * 180;
    const a1 = -90 + endFrac * 180;
    const toXY = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
    };
    const [x0, y0] = toXY(a0);
    const [x1, y1] = toXY(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Put-Call Ratio</h3>
        <span className={`text-xs font-medium ${pcrZoneColor[pcr.zone]}`}>{ZONE_LABEL[pcr.zone]}</span>
      </div>

      <svg viewBox="0 0 200 110" className="w-full mt-1">
        <path d={arcPath(0, bearishEnd)} stroke="#F2607D" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={arcPath(bearishEnd, bullishStart)} stroke="#E8B339" strokeWidth="14" fill="none" />
        <path d={arcPath(bullishStart, 1)} stroke="#2DD4A7" strokeWidth="14" fill="none" strokeLinecap="round" />

        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#E8EAF0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#E8EAF0" />

        <text x="14" y="106" fontSize="9" fill="#565D72">0.0</text>
        <text x="92" y="18" fontSize="9" fill="#565D72">1.1</text>
        <text x="174" y="106" fontSize="9" fill="#565D72" textAnchor="end">2.2+</text>
      </svg>

      <div className="text-center -mt-2">
        <div className="font-mono text-2xl font-bold tabnum">{pcr.overall_pcr.toFixed(2)}</div>
        <div className="text-[11px] text-text-faint mt-0.5">
          CE OI {(pcr.total_ce_oi / 1e5).toFixed(1)}L &middot; PE OI {(pcr.total_pe_oi / 1e5).toFixed(1)}L
        </div>
      </div>
    </div>
  );
}
