/** Decorative skyline of bars with a rising line. Purely visual; hidden from assistive tech. */
export function HeaderArt() {
  const bars = [22, 34, 28, 46, 40, 58, 52, 70, 64, 82];
  return (
    <svg className="header-art" viewBox="0 0 220 90" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ha-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {bars.map((h, i) => (
        <rect key={i} className="ha-bar" x={8 + i * 21} y={86 - h} width={13} height={h} rx={3} fill="url(#ha-grad)" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
      <path className="ha-line" d="M14 66 C 50 60, 70 52, 98 44 S 160 26, 212 12" />
      <circle className="ha-dot" cx="212" cy="12" r="4" />
    </svg>
  );
}
