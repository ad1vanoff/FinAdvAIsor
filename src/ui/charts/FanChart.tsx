import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { moneyCompact, money, projectGrowth } from '../../engine';

const W = 640;
const H = 270;
const PAD = { l: 58, r: 70, t: 18, b: 30 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

/**
 * Range of outcomes for the invested amount: median line with the 10th-90th
 * percentile band from the plan's own return and volatility assumptions.
 */
export function FanChart({ start, expectedReturn, volatility, years }: { start: number; expectedReturn: number; volatility: number; years: number }) {
  const n = Math.max(1, Math.min(40, Math.round(years)));
  const pts = useMemo(() => projectGrowth(start, expectedReturn, volatility, n), [start, expectedReturn, volatility, n]);
  const [hover, setHover] = useState<number | null>(null);

  const yMin = Math.min(...pts.map((p) => p.p10)) * 0.9;
  const yMax = Math.max(...pts.map((p) => p.p90)) * 1.04;
  const x = (yr: number) => PAD.l + (yr / n) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.year).toFixed(1)} ${y(p.p50).toFixed(1)}`).join(' ');
  const band =
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.year).toFixed(1)} ${y(p.p90).toFixed(1)}`).join(' ') +
    ' ' +
    [...pts].reverse().map((p) => `L${x(p.year).toFixed(1)} ${y(p.p10).toFixed(1)}`).join(' ') +
    ' Z';

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const yr = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * n);
    setHover(Math.max(0, Math.min(n, yr)));
  };

  const last = pts[n];
  const hp = hover === null ? null : pts[hover];
  const xTicks = n <= 10 ? pts.map((p) => p.year) : [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n];

  return (
    <div className="fan">
      <div className="fan-chart">
        <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Projected range after ${n} years: ${money(last.p10)} to ${money(last.p90)}, median ${money(last.p50)}`}>
          {niceTicks(yMin, yMax).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={PAD.l - 8} y={y(v)} textAnchor="end" dominantBaseline="central" className="tick">
                {moneyCompact(v)}
              </text>
            </g>
          ))}
          {xTicks.map((yr) => (
            <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="tick">
              {yr === 0 ? 'now' : `${yr} yr`}
            </text>
          ))}
          <path d={band} className="fan-band" />
          <path d={line} className="fan-line" />
          <text x={x(n) + 8} y={y(last.p90)} dominantBaseline="central" className="fan-end">
            {moneyCompact(last.p90)} <tspan className="muted-text">good</tspan>
          </text>
          <text x={x(n) + 8} y={y(last.p50)} dominantBaseline="central" className="fan-end strong">
            {moneyCompact(last.p50)} <tspan className="muted-text">median</tspan>
          </text>
          <text x={x(n) + 8} y={y(last.p10)} dominantBaseline="central" className="fan-end">
            {moneyCompact(last.p10)} <tspan className="muted-text">bad</tspan>
          </text>
          {hp && (
            <g className="fan-hover">
              <line x1={x(hp.year)} x2={x(hp.year)} y1={PAD.t} y2={H - PAD.b} />
              <circle cx={x(hp.year)} cy={y(hp.p50)} r={5} />
            </g>
          )}
        </svg>
        {hp && (
          <div className="tooltip fan-tip" style={{ left: `${(x(hp.year) / W) * 100}%`, top: `${(y(hp.p50) / H) * 100}%` }}>
            <strong>{hp.year === 0 ? 'Now' : `Year ${hp.year}`}</strong>
            <br />
            good {money(hp.p90)} · median {money(hp.p50)} · bad {money(hp.p10)}
          </div>
        )}
      </div>
      <p className="hint">
        Shaded band: the middle 80% of outcomes for {money(start)} under this plan's assumed return and volatility (lognormal model, nominal dollars). It describes the shape of the risk, not a forecast.
      </p>
    </div>
  );
}
