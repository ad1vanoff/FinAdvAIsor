import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ResearchSnapshot } from '../research/types';

/**
 * One shared copy of the research snapshot, so the Research tab and the allocator's
 * signal feed read the same validated data and the sources are queried once.
 */
interface Store {
  snap: ResearchSnapshot | null;
  error: string | null;
  loading: boolean;
}

let store: Store = { snap: null, error: null, loading: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<Store>) => {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
};

async function load(refresh: boolean): Promise<void> {
  if (store.loading) return;
  set({ loading: true, error: null });
  try {
    const res = await fetch(`/api/research${refresh ? '?refresh=1' : ''}`);
    if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests. Try again in a minute.' : `The research service returned ${res.status}.`);
    set({ snap: (await res.json()) as ResearchSnapshot, loading: false });
  } catch (e) {
    set({ loading: false, error: e instanceof TypeError ? 'Could not reach the research service. Start it with `npm run server` (or `npm run dev:full`).' : (e as Error).message });
  }
}

/** Fetches once on first use when `enabled`; `reload(true)` forces a refresh. */
export function useResearch(enabled = true) {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store,
  );
  useEffect(() => {
    if (enabled && !store.snap && !store.loading && !store.error) void load(false);
  }, [enabled]);
  const reload = useCallback((refresh = true) => load(refresh), []);
  return { ...s, reload };
}
