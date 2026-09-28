import { useRef } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { sourcesFor } from '../engine';

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span className="text">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Field({
  label,
  right,
  children,
  hint,
  error,
}: {
  label: string;
  right?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <span className="label">
        <span>{label}</span>
        {right}
      </span>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export interface ChoiceOption<T> {
  value: T;
  label: string;
  hint?: string;
}

/** Radio-style choice cards. */
export function Choices<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  row,
}: {
  options: ChoiceOption<T>[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  label: string;
  row?: boolean;
}) {
  return (
    <div className={`choices${row ? ' row' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.label}
          className="choice"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
        >
          <span className="radio" aria-hidden="true" />
          <span className="text">
            <span>{o.label}</span>
            {o.hint && <span className="hint">{o.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = 'Continue',
  canNext = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  canNext?: boolean;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onNext();
  };
  return (
    <form className="step" onSubmit={submit} noValidate>
      <div className="step-head">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {subtitle && <p className="secondary">{subtitle}</p>}
      </div>
      <div className="step-body">{children}</div>
      <div className="step-nav">
        {onBack ? (
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="btn primary" disabled={!canNext}>
          {nextLabel}
        </button>
      </div>
    </form>
  );
}

export function Progress({
  steps,
  current,
  reached,
  onJump,
}: {
  steps: { id: string; label: string }[];
  current: string;
  reached: number;
  onJump: (id: string) => void;
}) {
  const currentIndex = steps.findIndex((s) => s.id === current);
  return (
    <ol className="progress" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i === currentIndex ? 'active' : i < currentIndex ? 'done' : 'todo';
        const clickable = i <= reached && i !== currentIndex;
        return (
          <li key={s.id} className={state} aria-current={i === currentIndex ? 'step' : undefined}>
            <button type="button" disabled={!clickable} onClick={() => onJump(s.id)}>
              <span className="n">{i + 1}</span> {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export interface TabDef {
  id: string;
  label: string;
  badge?: ReactNode;
}

/** Accessible tab strip; the caller renders the active panel as children. */
export function Tabs({ tabs, active, onChange, children }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  };
  return (
    <div className="tabs">
      <div className="tablist" role="tablist" ref={listRef} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== null && t.badge !== 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {children}
      </div>
    </div>
  );
}

/** Inline "Sources: A · B" links for a list of source ids. Renders nothing for an empty list. */
export function SourceLinks({ ids, label = 'Sources' }: { ids: string[]; label?: string }) {
  const list = sourcesFor(ids);
  if (list.length === 0) return null;
  // Label by publisher, but when two links share a publisher, add the title so they can be told apart.
  const short = (p: string) => p.split(',')[0];
  const counts = new Map<string, number>();
  for (const s of list) counts.set(short(s.publisher), (counts.get(short(s.publisher)) ?? 0) + 1);
  return (
    <span className="src">
      {label}:{' '}
      {list.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noopener noreferrer" title={`${s.title} (${s.publisher})`}>
            {(counts.get(short(s.publisher)) ?? 0) > 1 ? `${short(s.publisher)}: ${s.title}` : short(s.publisher)}
          </a>
        </span>
      ))}
    </span>
  );
}
