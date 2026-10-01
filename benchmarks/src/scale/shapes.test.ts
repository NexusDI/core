import { describe, expect, it } from 'vitest';

import { GRAPH_SEED, SIZES } from './config.ts';
import { checkGraph, describeGraph, hash, type ScaleGraph } from './graph.ts';
import { deep, wide } from './shapes.ts';

/** Exact mean fan-out, before describeGraph rounds it. */
const meanFanOut = (g: ScaleGraph) =>
  g.providers.reduce((sum, p) => sum + p.deps.length, 0) / g.size;

const noDuplicateDeps = (g: ScaleGraph) =>
  g.providers.every((p) => new Set(p.deps).size === p.deps.length);

describe.each(SIZES)('wide at %i', (n) => {
  const g = wide(n);
  const d = describeGraph(g);
  const leaves = Math.ceil(n / 5);

  it('is a valid single-module graph of n classes', () => {
    expect(() => checkGraph(g)).not.toThrow();
    expect(d.providers).toBe(n);
    expect(d.modules).toBe(1);
    expect(d.kinds).toEqual({
      class: n,
      factory: 0,
      'async-factory': 0,
      value: 0,
    });
  });
  it('has ceil(n/5) leaves and two leaf deps on every other provider', () => {
    expect(g.providers.filter((p) => p.deps.length === 0)).toHaveLength(leaves);
    for (const p of g.providers.slice(leaves)) {
      expect(p.deps).toHaveLength(2);
      for (const dep of p.deps) expect(dep).toBeLessThan(leaves);
    }
    expect(noDuplicateDeps(g)).toBe(true);
  });
  it('has depth 1', () => {
    expect(d.maxDepth).toBe(1);
  });
  it.runIf(n >= 200)('has a mean fan-out within 0.05 of 1.6', () => {
    expect(Math.abs(meanFanOut(g) - 1.6)).toBeLessThanOrEqual(0.05);
  });
  it('gives the same hash for the same seed and another for another seed', () => {
    expect(hash(wide(n))).toBe(d.hash);
    expect(hash(wide(n, GRAPH_SEED + 1))).not.toBe(d.hash);
  });
});

describe.each(SIZES)('deep at %i', (n) => {
  const g = deep(n);
  const d = describeGraph(g);
  const chains = Math.ceil(n / 100);
  const length = n / chains;

  it('is a valid single-module graph of n classes', () => {
    expect(() => checkGraph(g)).not.toThrow();
    expect(d.providers).toBe(n);
    expect(d.modules).toBe(1);
    expect(d.kinds.class).toBe(n);
  });
  it('has ceil(n/100) chains of n/c providers, depth n/c - 1', () => {
    const heads = g.providers.filter((p) => p.deps.length === 0);
    expect(heads.map((p) => p.index)).toEqual(
      Array.from({ length: chains }, (_, c) => c * length),
    );
    expect(d.maxDepth).toBe(length - 1);
  });
  it('links every non-head to its predecessor, extras within its chain', () => {
    for (const p of g.providers) {
      if (p.index % length === 0) continue;
      expect(p.deps[0]).toBe(p.index - 1);
      expect(p.deps.length).toBeLessThanOrEqual(2);
      for (const dep of p.deps)
        expect(Math.floor(dep / length)).toBe(Math.floor(p.index / length));
    }
    expect(noDuplicateDeps(g)).toBe(true);
  });
  it.runIf(n >= 1000)('has a mean fan-out within 0.05 of 1.6', () => {
    expect(Math.abs(meanFanOut(g) - 1.6)).toBeLessThanOrEqual(0.05);
  });
  it('gives the same hash for the same seed and another for another seed', () => {
    expect(hash(deep(n))).toBe(d.hash);
    expect(hash(deep(n, GRAPH_SEED + 1))).not.toBe(d.hash);
  });
});

describe('target and entries', () => {
  it.each([
    ['wide', wide],
    ['deep', deep],
  ] as const)('%s targets an entry with the largest closure', (_, make) => {
    for (const n of SIZES) {
      const g = make(n);
      expect(g.entries).toContain(g.target);
      const closures = g.entries.map((e) => closureSize(g, e));
      const best = Math.max(...closures);
      expect(closureSize(g, g.target)).toBe(best);
      expect(g.entries[closures.indexOf(best)]).toBe(g.target);
    }
  });
});

/**
 * The committed hashes: a regression lock on the generator. A change here
 * changes every published graph, so it is reviewed like a fixture change and
 * GRAPH_SEED's comment applies.
 */
describe('committed hashes', () => {
  it('wide', () => {
    expect(SIZES.map((n) => hash(wide(n)))).toEqual([
      'f8b42741a272',
      '90df99d9279c',
      '939ca26eb015',
      '39f1234937b6',
    ]);
  });
  it('deep', () => {
    expect(SIZES.map((n) => hash(deep(n)))).toEqual([
      'b699102e63db',
      '51192d61165d',
      '52f6eba9dafb',
      'c2318eb9e719',
    ]);
  });
});

function closureSize(g: ScaleGraph, from: number): number {
  const seen = new Set<number>();
  const stack = [from];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (seen.has(i)) continue;
    seen.add(i);
    stack.push(...g.providers[i].deps);
  }
  return seen.size;
}
