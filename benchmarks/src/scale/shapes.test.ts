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
      alias: 0,
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

/** The measured figures of Research/App sizes.md that the committed seed must meet, by suite size. */
const BANDS: Readonly<
  Record<number, { depth: [number, number]; closure: [number, number] }>
> = {
  // 31 to 115 providers (5 apps)
  50: { depth: [3, 17], closure: [0.16, 0.5] },
  // 115 to 350 (9 apps)
  200: { depth: [7, 28], closure: [0.17, 0.45] },
  // 570 to 1,229 (bitwarden, vscode, novu-api, n8n)
  1000: { depth: [22, 32], closure: [0.18, 0.33] },
  // 1,635 to 2,249 (gauzy-api, twenty, theia)
  2500: { depth: [10, 42], closure: [0.07, 0.22] },
};

/** Pooled fan-out of 10,740 providers: 0, 1, 2, 3, 4, 5 to 8 and 9 or more. */
const POOLED_FAN_OUT = [0.2, 0.27, 0.19, 0.1, 0.07, 0.11, 0.06];

/** Longest dependency path with an alias hop counted as zero edges: the census's definition. */
function collapsedDepth(g: ScaleGraph): number {
  const depth = new Array<number>(g.size).fill(0);
  for (const p of g.providers)
    for (const d of p.deps)
      depth[p.index] = Math.max(
        depth[p.index],
        depth[d] + (p.kind === 'alias' ? 0 : 1),
      );
  return Math.max(...depth);
}

const tiersOf = (modules: number) =>
  Math.max(4, Math.round(Math.sqrt(modules)));

describe.each(SIZES)('mixed at %i', (n) => {
  const g = mixed(n);
  const d = describeGraph(g);
  const groups = members(g);
  const modules = g.modules.length;

  it('is a valid graph of n providers, every dependency visible', () => {
    expect(() => checkGraph(g)).not.toThrow();
    expect(d.providers).toBe(n);
  });
  it('lays modules out in index order, sizes 1 to 250, core at least 3', () => {
    let next = 0;
    groups.forEach((group, k) => {
      expect(group.map((p) => p.index)).toEqual(
        Array.from({ length: group.length }, (_, i) => next + i),
      );
      next += group.length;
      expect(group.length).toBeGreaterThanOrEqual(k === 0 ? 3 : 1);
      expect(group.length).toBeLessThanOrEqual(250);
    });
    expect(next).toBe(n);
  });
  it('places module k of M in tier floor(T k / M) with T = max(4, round(sqrt M))', () => {
    const t = tiersOf(modules);
    g.modules.forEach((mod, k) =>
      expect(mod.tier).toBe(Math.floor((t * k) / modules)),
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
  it('imports core in every other module, distinct lower-tier modules after it', () => {
    g.modules.forEach((mod, k) => {
      if (k === 0) return;
      expect(mod.imports[0]).toBe(0);
      expect(new Set(mod.imports).size).toBe(mod.imports.length);
      for (const i of mod.imports.slice(1))
        expect(g.modules[i].tier).toBeLessThan(mod.tier);
      // Whenever a non-core module sits below this one, one import comes from the tier just below.
      const lowerNonCore = g.modules
        .slice(1, k)
        .some((other) => other.tier < mod.tier);
      if (lowerNonCore)
        expect(
          mod.imports.slice(1).some((i) => g.modules[i].tier === mod.tier - 1),
        ).toBe(true);
    });
  });
  it('exports the last ceil(0.3 size) providers of each module', () => {
    groups.forEach((group, k) => {
      const last = group
        .slice(-Math.ceil(group.length * 0.3))
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
  it('gives values 5%, factories 10% and at most 5% aliases, exact counts', () => {
    expect(d.kinds.value).toBe(Math.round(n * 0.05));
    expect(d.kinds.factory).toBe(Math.round(n * 0.1));
    expect(d.kinds['async-factory']).toBe(0);
    // An alias with nothing visible to point at becomes a class.
    expect(d.kinds.alias).toBeLessThanOrEqual(Math.round(n * 0.05));
    expect(d.kinds.alias).toBeGreaterThanOrEqual(Math.round(n * 0.05) - 2);
  });
  it('points each alias at one earlier provider of its module or an export of an import', () => {
    for (const p of g.providers.filter((x) => x.kind === 'alias')) {
      expect(p.deps).toHaveLength(1);
      const target = g.providers[p.deps[0]];
      expect(target.index).toBeLessThan(p.index);
      expect([0, 1, 2]).not.toContain(target.index);
      const own = target.module === p.module;
      const exported =
        g.modules[p.module].imports.includes(target.module) &&
        g.modules[target.module].exports.includes(target.index);
      expect(own || exported).toBe(true);
    }
  });
  it('caps the fan-out of a class or factory at min(48, round(sqrt n))', () => {
    const cap = Math.min(48, Math.round(Math.sqrt(n)));
    for (const p of g.providers)
      if (p.kind !== 'value' && p.kind !== 'alias')
        expect(p.deps.length).toBeLessThanOrEqual(cap);
  });
  it('gives the same hash for the same seed and another for another seed', () => {
    expect(hash(mixed(n))).toBe(d.hash);
    expect(hash(mixed(n, GRAPH_SEED + 1))).not.toBe(d.hash);
  });
});

describe.each(SIZES)('mixed-async at %i', (n) => {
  const base = mixed(n);
  const g = mixedAsync(n);
  const lifted = Math.min(
    Math.round(n * 0.05),
    base.providers.filter((p) => p.kind === 'factory').length,
  );

  it('is a valid graph', () => {
    expect(() => checkGraph(g)).not.toThrow();
  });
  it('equals mixed except for its lowest-index round(0.05 n) factories, which become async', () => {
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
    const factories = base.providers.filter((p) => p.kind === 'factory');
    const asyncIndexes = new Set(
      factories.slice(0, lifted).map((p) => p.index),
    );
    g.providers.forEach((p, i) =>
      expect(p.kind).toBe(
        asyncIndexes.has(i) ? 'async-factory' : base.providers[i].kind,
      ),
    );
  });
  it('has round(0.05 n) async factories, clock first, at the bottom of the graph', () => {
    const asyncs = g.providers.filter((p) => p.kind === 'async-factory');
    expect(asyncs).toHaveLength(lifted);
    expect(asyncs[0].index).toBe(1);
    const factories = base.providers.filter((p) => p.kind === 'factory');
    expect(Math.max(...asyncs.map((p) => p.index))).toBe(
      factories[lifted - 1].index,
    );
  });
});

/**
 * The committed seed against the measured bands (Research/App sizes.md):
 * the figures of the graph the suite publishes, not a 32-seed median. A
 * different seed can land outside a band, and GRAPH_SEED does not move.
 */
describe.each(SIZES)('mixed at %i against the measured bands', (n) => {
  const g = mixed(n);
  const d = describeGraph(g);
  const band = BANDS[n];

  it.runIf(band !== undefined)('has a depth inside the measured band', () => {
    const depth = collapsedDepth(g);
    expect(depth).toBeGreaterThanOrEqual(band.depth[0]);
    expect(depth).toBeLessThanOrEqual(band.depth[1]);
    expect(d.maxDepth).toBeGreaterThanOrEqual(depth);
  });
  it.runIf(band !== undefined)(
    'has a target closure share inside the measured band',
    () => {
      const share = d.targetClosure / n;
      expect(share).toBeGreaterThanOrEqual(band.closure[0]);
      expect(share).toBeLessThanOrEqual(band.closure[1]);
    },
  );
  it('has a max fan-in inside the measured 4 to 36% of the graph', () => {
    expect(d.maxFanIn / n).toBeGreaterThanOrEqual(0.04);
    expect(d.maxFanIn / n).toBeLessThanOrEqual(0.36);
  });
  it.runIf(n >= 200)('exports 33 to 45% of its providers', () => {
    const exported = g.modules.reduce((sum, m) => sum + m.exports.length, 0);
    expect(exported / n).toBeGreaterThanOrEqual(0.33);
    expect(exported / n).toBeLessThanOrEqual(0.45);
  });
  it.runIf(n >= 1000)('has 4.0 to 5.0 imports per module', () => {
    const imports = g.modules.reduce((sum, m) => sum + m.imports.length, 0);
    expect(imports / g.modules.length).toBeGreaterThanOrEqual(4.0);
    expect(imports / g.modules.length).toBeLessThanOrEqual(5.0);
  });
  it.runIf(n >= 1000)(
    'has module sizes inside the NestJS pool: median 3, mean 6, 50% at 1 to 3',
    () => {
      const sizes = members(g)
        .map((m) => m.length)
        .sort((a, b) => a - b);
      const share = (lo: number, hi: number) =>
        sizes.filter((s) => s >= lo && s <= hi).length / sizes.length;
      const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const median = sizes[Math.floor(sizes.length / 2)];
      expect(median).toBeGreaterThanOrEqual(2);
      expect(median).toBeLessThanOrEqual(4);
      expect(mean).toBeGreaterThanOrEqual(4.5);
      expect(mean).toBeLessThanOrEqual(7.5);
      expect(share(1, 3)).toBeGreaterThanOrEqual(0.45);
      expect(share(1, 3)).toBeLessThanOrEqual(0.65);
      expect(share(4, 16)).toBeGreaterThanOrEqual(0.28);
      expect(share(4, 16)).toBeLessThanOrEqual(0.45);
      expect(share(17, 250)).toBeGreaterThanOrEqual(0.03);
      expect(share(17, 250)).toBeLessThanOrEqual(0.13);
    },
  );
  it.runIf(n >= 1000)(
    'has a fan-out histogram within 3 points of the pooled census',
    () => {
      const takers = g.providers.filter(
        (p) => p.kind === 'class' || p.kind === 'factory',
      );
      const bin = (k: number) => (k <= 4 ? k : k <= 8 ? 5 : 6);
      const counts = new Array<number>(7).fill(0);
      for (const p of takers) counts[bin(p.deps.length)]++;
      counts.forEach((c, b) =>
        expect(
          Math.abs(c / takers.length - POOLED_FAN_OUT[b]),
        ).toBeLessThanOrEqual(0.03),
      );
    },
  );
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

describe('target', () => {
  it.each([
    ['wide', wide],
    ['deep', deep],
    ['mixed', mixed],
    ['mixed-async', mixedAsync],
    ['modular', modular],
  ] as const)(
    '%s targets the provider with the largest closure in the graph',
    (_, make) => {
      for (const n of SIZES) {
        const g = make(n);
        const closures = g.providers.map((p) => closureSize(g, p.index));
        const best = Math.max(...closures);
        expect(closureSize(g, g.target)).toBe(best);
        expect(closures.indexOf(best)).toBe(g.target);
      }
    },
  );
  it('keeps wide and deep targets inside their entries: every provider is one', () => {
    for (const n of SIZES)
      for (const g of [wide(n), deep(n)]) expect(g.entries).toContain(g.target);
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
      'd5b8307f3e51',
      '43b9dac1a426',
      'fe96ee84e0db',
      '3656b19f07dc',
    ]);
  });
  it('mixed-async', () => {
    expect(SIZES.map((n) => hash(mixedAsync(n)))).toEqual([
      'ece185340786',
      '491fc1116fa2',
      'e894b28e87ca',
      '0338b52a6a33',
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
