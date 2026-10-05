import type { ReactNode } from 'react';

const base = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** One small line icon per step of the flow. */
export const STEP_ICONS: Record<string, ReactNode> = {
  basics: (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5v11M9.5 9.25h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5" />
    </svg>
  ),
  safety: (
    <svg {...base}>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  risk: (
    <svg {...base}>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="M12 16l4-5" />
      <circle cx="12" cy="16" r="1.5" />
      <path d="M2 16h2M20 16h2" />
    </svg>
  ),
  preferences: (
    <svg {...base}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  plan: (
    <svg {...base}>
      <path d="M12 3a9 9 0 1 0 9 9h-9V3z" />
      <path d="M14 3.2A9 9 0 0 1 20.8 10H14V3.2z" />
    </svg>
  ),
};
