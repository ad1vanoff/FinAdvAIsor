import { horizonEquityCap, pct } from '../../engine';

const W = 340;
const H = 120;
const PAD = { l: 34, r: 12, t: 12, b: 22 };
const MAX_YEARS = 40;
const MAX_CAP = 0.7;
const BREAKS = [0, 2, 4, 7, 12, MAX_YEARS];

const x = (years: number) => PAD.l + (years / MAX_YEARS) * (W - PAD.l - PAD.r);
const y = (cap: number) => PAD.t + (1 - cap / MAX_CAP) * (H - PAD.t - PAD.b);

/** Step chart of the stock ceiling by time horizon, with a marker at the chosen horizon. */
export function GlidePath({ horizon }: { horizon: number }) {
  const h = Math.max(0, Math.min(MAX_YEARS, horizon));
  const cap = horizonEquityCap(h);

  let d = `M${x(0)} ${y(horizonEquityCap(0))}`;
  for (let i = 1; i < BREAKS.length; i++) {
    const from = BREAKS[i - 1];
    const to = BREAKS[i];
    d += ` H${x(to)}`;
    if (i < BREAKS.length - 1) d += ` V${y(horizonEquityCap(to))}`;
    void from;
  }
  const area = `${d} V${y(0)} H${x(0)} Z`;

  return (
    <div className="glide" aria-label={`Stock ceiling by horizon; at ${h} years the ceiling is ${pct(cap)}`} role="img">
      <svg viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.35, 0.7].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 6} y={y(v)} textAnchor="end" dominantBaseline="central" className="tick">
              {pct(v)}
            </text>
          </g>
        ))}
        {[0, 10, 20, 30, 40].map((yr) => (
          <text key={yr} x={x(yr)} y={H - 6} textAnchor="middle" className="tick">
            {yr}{yr === 40 ? '+' : ''}
          </text>
        ))}
        <path d={area} className="glide-area" />
        <path d={d} className="glide-line" />
        <g className="glide-marker" style={{ transform: `translateX(${x(h) - x(0)}px)` }}>
          <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} />
          <circle cx={x(0)} cy={y(cap)} r={5} />
        </g>
        <text x={Math.min(W - PAD.r - 70, Math.max(PAD.l, x(h) + 8))} y={Math.max(PAD.t + 10, y(cap) - 10)} className="glide-label">
          {pct(cap)} stocks max
        </text>
      </svg>
      <span className="hint">Stock ceiling by years until the money is needed</span>
    </div>
  );
}
