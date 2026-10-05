import { useState } from 'react';
import { pct } from '../../engine';
import type { ProfileComparison, RiskTolerance } from '../../engine';

const W = 520;
const H = 250;
const PAD = { l: 52, r: 20, t: 18, b: 34 };

/** Where the plan sits on a risk-versus-return map of the four profiles. */
export function RiskReturnMap({ comparisons, current, currentProfile }: { comparisons: ProfileComparison[]; current: { expectedReturn: number; volatility: number }; currentProfile: RiskTolerance }) {
  const [hover, setHover] = useState<string | null>(null);
  const vols = [...comparisons.map((c) => c.volatility), current.volatility];
  const rets = [...comparisons.map((c) => c.expectedReturn), current.expectedReturn];
  const xMax = Math.max(...vols) * 1.2;
  const yMin = Math.min(...rets) * 0.85;
  const yMax = Math.max(...rets) * 1.1;
  const x = (v: number) => PAD.l + (v / xMax) * (W - PAD.l - PAD.r);
  const y = (r: number) => PAD.t + (1 - (r - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const path = comparisons.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.volatility).toFixed(1)} ${y(c.expectedReturn).toFixed(1)}`).join(' ');
  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v * 200) / 200);
  const xTicks = [0, xMax / 3, (2 * xMax) / 3, xMax].map((v) => Math.round(v * 100) / 100);

  return (
    <div className="rrmap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Expected return versus volatility for each risk profile, with this plan highlighted">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 8} y={y(v)} textAnchor="end" dominantBaseline="central" className="tick">
              {pct(v, 1)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={`x${v}`} x={x(v)} y={H - 12} textAnchor="middle" className="tick">
            {pct(v)}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 0} textAnchor="end" className="tick">
          volatility →
        </text>
        <text x={PAD.l} y={PAD.t - 6} className="tick">
          expected return ↑
        </text>
        <path d={path} className="rr-path" />
        {comparisons.map((c) => {
          const active = hover === c.riskTolerance;
          return (
            <g
              key={c.riskTolerance}
              className={`rr-dot${c.riskTolerance === currentProfile ? ' current' : ''}${active ? ' active' : ''}`}
              onMouseEnter={() => setHover(c.riskTolerance)}
              onMouseLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(c.riskTolerance)}
              onBlur={() => setHover(null)}
              aria-label={`${c.label}: ${pct(c.expectedReturn, 1)} expected return, ${pct(c.volatility, 1)} volatility`}
            >
              <circle cx={x(c.volatility)} cy={y(c.expectedReturn)} r={12} className="hit" />
              <circle cx={x(c.volatility)} cy={y(c.expectedReturn)} r={6} />
              <text x={x(c.volatility)} y={y(c.expectedReturn) - 12} textAnchor="middle" className="rr-label">
                {c.label}
              </text>
              {active && (
                <text x={x(c.volatility)} y={y(c.expectedReturn) + 22} textAnchor="middle" className="rr-val">
                  {pct(c.expectedReturn, 1)} / yr · vol {pct(c.volatility, 1)} · bad year {pct(c.typicalBadYear, 1)}
                </text>
              )}
            </g>
          );
        })}
        <g className="rr-you">
          <path
            d={`M${x(current.volatility)} ${y(current.expectedReturn) - 9} l7 9 l-7 9 l-7 -9 z`}
          />
          <text x={x(current.volatility) + 12} y={y(current.expectedReturn) + 4} className="rr-label strong">
            your plan
          </text>
        </g>
      </svg>
      <p className="hint">Each dot is your own inputs run through a different profile. The diamond is the plan as built, including any signals and preferences.</p>
    </div>
  );
}
