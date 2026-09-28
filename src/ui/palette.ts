import { useEffect, useState } from 'react';
import type { Bucket } from '../engine';

/**
 * Chart colours: one fixed categorical slot per bucket, in display order, so
 * adjacent segments are always the validated adjacent pairs. The dark column is
 * the same hues re-stepped for the dark surface (validated separately).
 */
export const BUCKET_COLORS: Record<'light' | 'dark', Record<Bucket, string>> = {
  light: { reserves: '#2a78d6', cash: '#eb6834', fixed_income: '#1baf7a', equity: '#eda100', alternatives: '#e87ba4' },
  dark: { reserves: '#3987e5', cash: '#d95926', fixed_income: '#199e70', equity: '#c98500', alternatives: '#d55181' },
};

export function usePrefersDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

/** Ink colour for a label sitting inside a coloured fill. */
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  return lum > 0.35 ? '#0b0b0b' : '#ffffff';
}
