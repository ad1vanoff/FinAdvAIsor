export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const round2 = (x: number): number => Math.round(x * 100) / 100;

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const moneyFmtCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const money = (x: number, cents = false): string => (cents ? moneyFmtCents : moneyFmt).format(x);

/** 0.354 -> "35%" */
export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;

/** 0.05 -> "5 points" */
export const pts = (x: number): string => {
  const p = Math.round(x * 1000) / 10;
  return `${p} point${p === 1 ? '' : 's'}`;
};

/** 1234567 -> "$1.23M", 45600 -> "$45.6K", 950 -> "$950" */
export const moneyCompact = (x: number): string => {
  const abs = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};
