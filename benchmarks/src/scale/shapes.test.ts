import { describe, expect, it } from 'vitest';

import { GRAPH_SEED, SIZES } from './config.ts';
import { checkGraph, describeGraph, hash, type ScaleGraph } from './graph.ts';
import { deep, mixed, mixedAsync, modular, wide } from './shapes.ts';

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

/** Provider indexes per module, in order. */
const members = (g: ScaleGraph) =>
  g.modules.map((_, k) => g.providers.filter((p) => p.module === k));

/** True when every module is the root's import or imported by a reachable one. */
function allReachable(g: ScaleGraph): boolean {
  const seen = new Set<number>();
  const stack = [...g.rootImports];
  while (stack.length > 0) {
    const k = stack.pop() as number;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...g.modules[k].imports);
  }
  return seen.size === g.modules.length;
}

describe.each(SIZES)('mixed at %i', (n) => {
  const g = mixed(n);
  const d = describeGraph(g);
  const groups = members(g);

  it('is a valid graph of n providers, every dependency visible', () => {
    expect(() => checkGraph(g)).not.toThrow();
    expect(d.providers).toBe(n);
  });
  it('lays modules out in index order with sizes 4..16, the last any size', () => {
    let next = 0;
    groups.forEach((group, k) => {
      expect(group.map((p) => p.index)).toEqual(
        Array.from({ length: group.length }, (_, i) => next + i),
      );
      next += group.length;
      if (k < groups.length - 1) {
        expect(group.length).toBeGreaterThanOrEqual(4);
        expect(group.length).toBeLessThanOrEqual(16);
      }
    });
  });
  it('places module k of M in tier floor(4k/M)', () => {
    const m = g.modules.length;
    g.modules.forEach((mod, k) =>
      expect(mod.tier).toBe(Math.floor((4 * k) / m)),
    );
  });
  it.runIf(n >= 200)('has every tier from 0 to 3', () => {
    expect(new Set(g.modules.map((m) => m.tier))).toEqual(
      new Set([0, 1, 2, 3]),
    );
  });
  it('makes core module 0 with the config, clock and logger hubs exported', () => {
    expect(
      g.providers.slice(0, 3).map((p) => [p.kind, p.deps, p.module]),
    ).toEqual([
      ['value', [], 0],
      ['factory', [], 0],
      ['class', [0], 0],
    ]);
    expect(g.modules[0].tier).toBe(0);
    expect(g.modules[0].imports).toEqual([]);
    expect(g.modules[0].exports).toEqual(expect.arrayContaining([0, 1, 2]));
  });
  it('imports core in every other module, plus one or two lower-tier modules', () => {
    g.modules.slice(1).forEach((mod) => {
      expect(mod.imports[0]).toBe(0);
      const others = mod.imports.slice(1);
      expect(others.length).toBeLessThanOrEqual(2);
      expect(new Set(mod.imports).size).toBe(mod.imports.length);
      for (const i of others) expect(g.modules[i].tier).toBeLessThan(mod.tier);
      if (mod.tier > 0)
        expect(
          mod.imports.some((i) => g.modules[i].tier === mod.tier - 1),
        ).toBe(true);
    });
  });
  it('exports the last ceil(size/4) providers of each module', () => {
    groups.forEach((group, k) => {
      const last = group
        .slice(-Math.ceil(group.length / 4))
        .map((p) => p.index);
      const extra = k === 0 ? [0, 1, 2] : [];
      expect(g.modules[k].exports).toEqual(
        [...new Set([...extra, ...last])].sort((a, b) => a - b),
      );
    });
  });
  it('reaches every module from the root', () => {
    expect(allReachable(g)).toBe(true);
  });
  it('gives values 5% and factories 10% of providers, within one', () => {
    expect(Math.abs(d.kinds.value - n * 0.05)).toBeLessThanOrEqual(1);
    expect(Math.abs(d.kinds.factory - n * 0.1)).toBeLessThanOrEqual(1);
    expect(d.kinds['async-factory']).toBe(0);
  });
  it.runIf(n >= 1000)('has a mean fan-out within 0.15 of 1.9', () => {
    expect(Math.abs(meanFanOut(g) - 1.9)).toBeLessThanOrEqual(0.15);
  });
  it('gives the same hash for the same seed and another for another seed', () => {
    expect(hash(mixed(n))).toBe(d.hash);
    expect(hash(mixed(n, GRAPH_SEED + 1))).not.toBe(d.hash);
  });
});

describe.each(SIZES)('mixed-async at %i', (n) => {
  const base = mixed(n);
  const g = mixedAsync(n);

  it('is a valid graph', () => {
    expect(() => checkGraph(g)).not.toThrow();
  });
  it('equals mixed except for the kinds of tier 0 and 1 factories', () => {
    expect(g.modules).toEqual(base.modules);
    const shape = (p: ScaleGraph['providers'][number]) => [
      p.index,
      p.name,
      p.deps,
      p.module,
    ];
    expect(g.providers.map(shape)).toEqual(base.providers.map(shape));
    expect([g.rootImports, g.entries, g.target]).toEqual([
      base.rootImports,
      base.entries,
      base.target,
    ]);
    g.providers.forEach((p, i) => {
      const was = base.providers[i].kind;
      const low = g.modules[p.module].tier <= 1;
      expect(p.kind).toBe(was === 'factory' && low ? 'async-factory' : was);
    });
  });
  it('has async factories, all in tiers 0 and 1', () => {
    const asyncs = g.providers.filter((p) => p.kind === 'async-factory');
    expect(asyncs.length).toBeGreaterThan(0);
    for (const p of asyncs)
      expect(g.modules[p.module].tier).toBeLessThanOrEqual(1);
  });
});

describe.each(SIZES)('modular at %i', (n) => {
  const g = modular(n);
  const d = describeGraph(g);
  const groups = members(g);

  it('is a valid graph of n classes, every dependency visible', () => {
    expect(() => checkGraph(g)).not.toThrow();
    expect(d.kinds.class).toBe(n);
  });
  it('has n/10 modules of 10 providers in index order', () => {
    expect(g.modules).toHaveLength(n / 10);
    groups.forEach((group, k) =>
      expect(group.map((p) => p.index)).toEqual(
        Array.from({ length: 10 }, (_, i) => k * 10 + i),
      ),
    );
  });
  it('imports one or two distinct lower modules in every module after the first', () => {
    expect(g.modules[0].imports).toEqual([]);
    g.modules.slice(1).forEach((mod, j) => {
      const k = j + 1;
      expect(mod.imports.length).toBeGreaterThanOrEqual(1);
      expect(mod.imports.length).toBeLessThanOrEqual(Math.min(2, k));
      expect(new Set(mod.imports).size).toBe(mod.imports.length);
      for (const i of mod.imports) expect(i).toBeLessThan(k);
    });
  });
  it('exports the last 3 providers of each module', () => {
    g.modules.forEach((mod, k) =>
      expect(mod.exports).toEqual([k * 10 + 7, k * 10 + 8, k * 10 + 9]),
    );
  });
  it('gives every provider one or two deps, except the first', () => {
    expect(g.providers[0].deps).toEqual([]);
    for (const p of g.providers.slice(2))
      expect([1, 2]).toContain(p.deps.length);
  });
  it('reaches every module from the root', () => {
    expect(allReachable(g)).toBe(true);
  });
  it.runIf(n >= 1000)('has a mean fan-out within 0.05 of 1.6', () => {
    expect(Math.abs(meanFanOut(g) - 1.6)).toBeLessThanOrEqual(0.05);
  });
  it('gives the same hash for the same seed and another for another seed', () => {
    expect(hash(modular(n))).toBe(d.hash);
    expect(hash(modular(n, GRAPH_SEED + 1))).not.toBe(d.hash);
  });
});

describe('target and entries', () => {
  it.each([
    ['wide', wide],
    ['deep', deep],
    ['mixed', mixed],
    ['mixed-async', mixedAsync],
    ['modular', modular],
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
  it('mixed', () => {
    expect(SIZES.map((n) => hash(mixed(n)))).toEqual([
      '868ff8f30086',
      'e9e0741a34d7',
      'dc0a808a1c32',
      '7690f0bd862b',
    ]);
  });
  it('mixed-async', () => {
    expect(SIZES.map((n) => hash(mixedAsync(n)))).toEqual([
      'ab964e4f3c49',
      '926edb1318b3',
      '7cc8accc5c8e',
      '8731cafb4eda',
    ]);
  });
  it('modular', () => {
    expect(SIZES.map((n) => hash(modular(n)))).toEqual([
      'c40c06b1d07d',
      '354dcd425810',
      '0477fd9a8552',
      'a4cf51a0b4ea',
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
