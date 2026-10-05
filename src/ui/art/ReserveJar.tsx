/**
 * A jar that fills as the emergency reserve is covered. `fill` is 0..1.
 */
export function ReserveJar({ fill, label, sublabel }: { fill: number; label: string; sublabel?: string }) {
  const f = Math.max(0, Math.min(1, fill));
  const liquidTravel = (1 - f) * 100;
  return (
    <div className="jar-wrap" role="img" aria-label={`${label}${sublabel ? `, ${sublabel}` : ''}`}>
      <svg viewBox="0 0 120 150" className="jar">
        <defs>
          <clipPath id="jar-clip">
            <path d="M30 34 h60 v6 a6 6 0 0 1 -3 5 v83 a12 12 0 0 1 -12 12 h-30 a12 12 0 0 1 -12 -12 v-83 a6 6 0 0 1 -3 -5 z" />
          </clipPath>
        </defs>
        <g clipPath="url(#jar-clip)">
          <g className="jar-liquid" style={{ transform: `translateY(${liquidTravel}px)` }}>
            <rect x="0" y="40" width="120" height="120" />
            <path className="jar-wave" d="M-120 42 q 15 -6 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 v 20 h -240 z" />
          </g>
        </g>
        <path className="jar-outline" d="M30 34 h60 v6 a6 6 0 0 1 -3 5 v83 a12 12 0 0 1 -12 12 h-30 a12 12 0 0 1 -12 -12 v-83 a6 6 0 0 1 -3 -5 z" />
        <rect className="jar-lid" x="26" y="22" width="68" height="12" rx="3" />
        <text x="60" y="94" textAnchor="middle" className="jar-text">
          {Math.round(f * 100)}%
        </text>
      </svg>
      <div className="jar-caption">
        <strong>{label}</strong>
        {sublabel && <span className="hint">{sublabel}</span>}
      </div>
    </div>
  );
}
