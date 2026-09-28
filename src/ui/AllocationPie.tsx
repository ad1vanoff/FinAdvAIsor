import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ASSET_CLASSES, BUCKET_LABELS, BUCKET_ORDER, money, pct } from '../engine';
import type { AllocationLine, AllocationPlan, Bucket } from '../engine';
import { BUCKET_COLORS, inkFor, usePrefersDark } from './palette';

/**
 * Interactive donut of the whole plan. Hover or focus a slice (or its legend
 * row) to read it in the centre; click to pin it, which also highlights the
 * matching rows in the table. Slices sweep in when the chart first appears.
 */

export interface Slice {
  id: string;
  label: string;
  short: string;
  bucket: Bucket;
  weight: number;
  dollars: number;
  color: string;
  line?: AllocationLine;
}

type Mode = 'lines' | 'buckets';

const BUCKET_SHORT: Record<Bucket, string> = { reserves: 'Reserves', cash: 'Cash', fixed_income: 'Bonds', equity: 'Stocks', alternatives: 'Alternatives' };

/** Lightness steps for lines inside one bucket, so siblings share a hue but stay distinct. */
const SHADES = [0, 0.3, -0.26, 0.52, -0.44, 0.68];

function mix(hex: string, target: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

function shade(base: string, k: number, dark: boolean): string {
  const t = SHADES[k % SHADES.length];
  if (t === 0) return base;
  return t > 0 ? mix(base, '#ffffff', t) : mix(base, '#000000', dark ? -t * 0.55 : -t);
}

export function sliceId(line: AllocationLine): string {
  return `${line.role}-${line.assetClass}`;
}

export function buildSlices(plan: AllocationPlan, mode: Mode, dark: boolean): Slice[] {
  const colors = BUCKET_COLORS[dark ? 'dark' : 'light'];
  if (mode === 'buckets') {
    return plan.buckets.map((b) => ({
      id: b.bucket,
      label: BUCKET_LABELS[b.bucket],
      short: BUCKET_SHORT[b.bucket],
      bucket: b.bucket,
      weight: b.weightOfTotal,
      dollars: b.dollars,
      color: colors[b.bucket],
    }));
  }
  const seen: Partial<Record<Bucket, number>> = {};
  return plan.lines.map((l) => {
    const k = seen[l.bucket] ?? 0;
    seen[l.bucket] = k + 1;
    const short = l.role === 'emergency_fund' ? 'Emergency fund' : l.role === 'near_term' ? 'Near-term cash' : ASSET_CLASSES[l.assetClass].shortName;
    return { id: sliceId(l), label: l.name, short, bucket: l.bucket, weight: l.weightOfTotal, dollars: l.dollars, color: shade(colors[l.bucket], k, dark), line: l };
  });
}

const SIZE = 240;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 108;
const RI = 68;
const TAU = Math.PI * 2;

const polar = (r: number, a: number): [number, number] => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

function arcPath(a0: number, a1: number): string {
  const span = Math.min(a1 - a0, TAU - 0.0001);
  if (span <= 0) return '';
  const end = a0 + span;
  const large = span > Math.PI ? 1 : 0;
  const [x1, y1] = polar(R, a0);
  const [x2, y2] = polar(R, end);
  const [x3, y3] = polar(RI, end);
  const [x4, y4] = polar(RI, a0);
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)} ${f(y1)} A${R} ${R} 0 ${large} 1 ${f(x2)} ${f(y2)} L${f(x3)} ${f(y3)} A${RI} ${RI} 0 ${large} 0 ${f(x4)} ${f(y4)} Z`;
}

export function AllocationPie({ plan, selected, onSelect }: { plan: AllocationPlan; selected: string | null; onSelect: (id: string | null) => void }) {
  const dark = usePrefersDark();
  const [mode, setMode] = useState<Mode>('lines');
  const [hover, setHover] = useState<string | null>(null);
  const slices = useMemo(() => buildSlices(plan, mode, dark), [plan, mode, dark]);
  const shapeKey = slices.map((s) => s.id).join('|');

  // Sweep-in animation whenever the set of slices changes (first render, mode switch, a toggle that adds a line).
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const duration = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Background tabs pause animation frames; never leave the chart unpainted.
    const fallback = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      setProgress(1);
    }, duration + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [shapeKey]);

  const activeId = hover ?? selected;
  const active = slices.find((s) => s.id === activeId) ?? null;

  let acc = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const a0 = acc;
    const full = s.weight * TAU;
    acc += full;
    return { s, a0, a1: a0 + full * progress, mid: a0 + full / 2 };
  });

  const toggle = (id: string) => onSelect(selected === id ? null : id);
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(id);
    }
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    onSelect(null);
    setHover(null);
  };

  return (
    <div className="pie">
      <div className="pie-toolbar">
        <div className="seg-toggle" role="group" aria-label="Chart detail">
          <button type="button" aria-pressed={mode === 'lines'} onClick={() => switchMode('lines')}>
            By asset class
          </button>
          <button type="button" aria-pressed={mode === 'buckets'} onClick={() => switchMode('buckets')}>
            By bucket
          </button>
        </div>
        <span className="hint">Hover a slice to read it, click to pin it and highlight it in the table.</span>
      </div>

      <div className="pie-body">
        <div className="pie-chart">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Allocation donut chart">
            {arcs.map(({ s, a0, a1, mid }) => {
              const isActive = active?.id === s.id;
              const dim = active !== null && !isActive;
              const [dx, dy] = isActive ? [Math.cos(mid) * 5, Math.sin(mid) * 5] : [0, 0];
              return (
                <path
                  key={s.id}
                  d={arcPath(a0, a1)}
                  fill={s.color}
                  className={`slice${dim ? ' dim' : ''}${selected === s.id ? ' pinned' : ''}`}
                  style={{ transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === s.id}
                  aria-label={`${s.label}: ${pct(s.weight, 1)} of total, ${money(s.dollars)}`}
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(s.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => toggle(s.id)}
                  onKeyDown={onKey(s.id)}
                />
              );
            })}
            {progress > 0.97 &&
              arcs
                .filter(({ s }) => s.weight >= 0.07)
                .map(({ s, mid }) => {
                  const [x, y] = polar((R + RI) / 2, mid);
                  return (
                    <text key={`t-${s.id}`} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="slice-label" fill={inkFor(s.color)}>
                      {pct(s.weight)}
                    </text>
                  );
                })}
          </svg>
          <div className="pie-center" aria-live="polite">
            {active ? (
              <>
                <span className="c-name">{active.short}</span>
                <span className="c-big num">{pct(active.weight, 1)}</span>
                <span className="c-sub num">{money(active.dollars)}</span>
              </>
            ) : (
              <>
                <span className="c-name">Total</span>
                <span className="c-big num">{money(plan.summary.totalAmount)}</span>
                <span className="c-sub">{plan.lines.length} positions</span>
              </>
            )}
          </div>
        </div>

        <div className="pie-legend">
          {BUCKET_ORDER.map((b) => {
            const group = slices.filter((s) => s.bucket === b);
            if (group.length === 0) return null;
            const bucket = plan.buckets.find((x) => x.bucket === b)!;
            return (
              <div className="legend-group" key={b}>
                {mode === 'lines' && (
                  <div className="legend-head">
                    <span>{BUCKET_LABELS[b]}</span>
                    <span className="num">{pct(bucket.weightOfTotal, 1)}</span>
                  </div>
                )}
                {group.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`legend-item${activeId === s.id ? ' active' : ''}`}
                    aria-pressed={selected === s.id}
                    onMouseEnter={() => setHover(s.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(s.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => toggle(s.id)}
                  >
                    <span className="swatch" style={{ background: s.color }} />
                    <span className="l-name">{mode === 'lines' ? s.short : s.label}</span>
                    <span className="num l-pct">{pct(s.weight, 1)}</span>
                    <span className="num l-money">{money(s.dollars)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
