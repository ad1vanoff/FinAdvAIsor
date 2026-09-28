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
