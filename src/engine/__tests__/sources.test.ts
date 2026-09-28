import { describe, expect, it } from 'vitest';
import { ASSET_CLASSES } from '../catalog';
import { ASSET_CLASS_SOURCES, RULE_REFERENCES, SOURCES, sourcesFor } from '../sources';
import type { AssetClassId } from '../types';

describe('sources', () => {
  it('every source is https and self-consistent', () => {
    for (const [key, s] of Object.entries(SOURCES)) {
      expect(s.id).toBe(key);
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.publisher.length).toBeGreaterThan(2);
    }
  });

  it('every rule points at real sources and has a unique id', () => {
    const ids = new Set<string>();
    for (const r of RULE_REFERENCES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      for (const sid of r.sourceIds) expect(SOURCES[sid], `rule ${r.id} -> ${sid}`).toBeDefined();
    }
  });

  it('every asset class has at least one valid source', () => {
    for (const id of Object.keys(ASSET_CLASSES) as AssetClassId[]) {
      const list = ASSET_CLASS_SOURCES[id];
      expect(list.length).toBeGreaterThan(0);
      expect(sourcesFor(list)).toHaveLength(list.length);
    }
  });

  it('sourcesFor drops unknown ids instead of throwing', () => {
    expect(sourcesFor(['nope', 'treasury_tips'])).toHaveLength(1);
  });
});
