/**
 * The graph shapes of the scale suite (spec 2026-10-01, sections 3 and 14).
 * Each takes a size and the graph seed and draws from its own stream.
 */
import { mulberry32 } from '@nexusdi/bench-kit';

import { GRAPH_SEED, streamSeed } from './config.ts';
import {
  assemble,
  padName,
  type ProviderKind,
  type ScaleGraph,
  type ScaleModule,
  type ScaleProvider,
} from './graph.ts';

type Rand = () => number;

/** A uniform integer in lo..hi, both included. */
const randInt = (rand: Rand, lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1));

const pick = <T>(rand: Rand, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];

/** Fisher-Yates, in place. */
function shuffle<T>(rand: Rand, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Draws one dependency from the first non-empty pool, starting at `start`
 * and wrapping around, skipping deps already taken. Returns false when
 * every pool is exhausted, so the provider ends with fewer deps.
 */
function drawDep(
  rand: Rand,
  pools: ReadonlyArray<readonly number[]>,
  start: number,
  deps: number[],
): boolean {
  for (let j = 0; j < pools.length; j++) {
    const pool = pools[(start + j) % pools.length].filter(
      (d) => !deps.includes(d),
    );
    if (pool.length > 0) {
      deps.push(pick(rand, pool));
      return true;
    }
  }
  return false;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => from + i);

const provider = (
  index: number,
  size: number,
  kind: ProviderKind,
  deps: number[],
  module: number,
): ScaleProvider => ({
  index,
  name: padName('p', index, size),
  kind,
  deps,
  module,
});

/** One module that exports everything, so every provider is an entry. */
const singleModule = (size: number): ScaleModule[] => [
  {
    name: 'm0',
    tier: 0,
    imports: [],
    exports: Array.from({ length: size }, (_, i) => i),
  },
];

/**
 * The first ⌈n/5⌉ providers are leaves; every other provider takes two
 * distinct leaves drawn uniformly. Depth 1, mean fan-out 1.6, all classes.
 */
export function wide(size: number, seed = GRAPH_SEED): ScaleGraph {
  const rand = mulberry32(streamSeed('wide', size, seed));
  const leaves = Math.ceil(size / 5);
  const providers: ScaleProvider[] = [];
  for (let i = 0; i < size; i++) {
    const deps: number[] = [];
    if (i >= leaves) {
      const a = randInt(rand, 0, leaves - 1);
      let b = randInt(rand, 0, leaves - 1);
      while (b === a) b = randInt(rand, 0, leaves - 1);
      deps.push(a, b);
    }
    providers.push(provider(i, size, 'class', deps, 0));
  }
  return assemble('wide', size, seed, providers, singleModule(size));
}

/**
 * ⌈n/100⌉ chains of equal length (the last takes the remainder), laid out
 * one after another. Each provider after a chain's head takes its
 * predecessor and, with probability 0.6, one more distinct earlier provider
 * of its chain. The mean fan-out matches `wide`, so the two differ in depth.
 */
export function deep(size: number, seed = GRAPH_SEED): ScaleGraph {
  const rand = mulberry32(streamSeed('deep', size, seed));
  const chains = Math.ceil(size / 100);
  const length = Math.floor(size / chains);
  const providers: ScaleProvider[] = [];
  for (let c = 0; c < chains; c++) {
    const head = c * length;
    const end = c === chains - 1 ? size : head + length;
    for (let i = head; i < end; i++) {
      const deps: number[] = [];
      if (i > head) deps.push(i - 1);
      // Candidates for the extra dep: head..i-2, which excludes the predecessor.
      if (i - 1 > head && rand() < 0.6) deps.push(randInt(rand, head, i - 2));
      providers.push(provider(i, size, 'class', deps, 0));
    }
  }
  return assemble('deep', size, seed, providers, singleModule(size));
}

/** The hub providers of `mixed`, all in core (module 0) and exported. */
const CONFIG = 0;
const CLOCK = 1;
const LOGGER = 2;
const HUBS = [CONFIG, CLOCK, LOGGER];

/** P(k deps) for a class or factory of `mixed`: mean 1.9. */
const MIXED_DEP_COUNTS = [0.1, 0.3, 0.3, 0.2, 0.1];

/**
 * The realistic shape: modules of 4 to 16 providers in four tiers. Core
 * holds the config, clock and logger hubs; every other module imports core
 * and one or two lower-tier modules, one of them from the tier just below.
 * Values are 5% of providers and factories 10%.
 */
export function mixed(size: number, seed = GRAPH_SEED): ScaleGraph {
  const { providers, modules } = mixedStructure(size, seed);
  return assemble('mixed', size, seed, providers, modules);
}

/**
 * `mixed` with every factory in a tier 0 or tier 1 module made async: the
 * same stream and structure, so the two differ in those kinds alone.
 */
export function mixedAsync(size: number, seed = GRAPH_SEED): ScaleGraph {
  const { providers, modules } = mixedStructure(size, seed);
  const lifted = providers.map((p) =>
    p.kind === 'factory' && modules[p.module].tier <= 1
      ? { ...p, kind: 'async-factory' as const }
      : p,
  );
  return assemble('mixed-async', size, seed, lifted, modules);
}

function mixedStructure(
  size: number,
  seed: number,
): { providers: ScaleProvider[]; modules: ScaleModule[] } {
  const rand = mulberry32(streamSeed('mixed', size, seed));

  const sizes: number[] = [];
  for (let total = 0; total < size;) {
    const next = Math.min(randInt(rand, 4, 16), size - total);
    sizes.push(next);
    total += next;
  }
  const count = sizes.length;
  const starts = sizes.map((_, k) =>
    sizes.slice(0, k).reduce((a, b) => a + b, 0),
  );
  const tier = (k: number) => Math.floor((4 * k) / count);

  const modules: ScaleModule[] = sizes.map((n, k) => {
    const own = range(starts[k], starts[k] + n);
    const last = own.slice(-Math.ceil(n / 4));
    const exports = k === 0 ? [...new Set([...HUBS, ...last])] : last;
    return {
      name: padName('m', k, count),
      tier: tier(k),
      imports: [],
      exports: exports.sort((a, b) => a - b),
    };
  });
  for (let k = 1; k < count; k++) {
    const t = tier(k);
    const imports = [0];
    // Core is imported already, so the extra imports come from the others.
    const lower = range(1, k).filter((j) => tier(j) < t);
    const below = lower.filter((j) => tier(j) === t - 1);
    // When tier t-1 holds core alone, core is the import from it.
    if (below.length > 0) {
      imports.push(pick(rand, below));
      const rest = lower.filter((j) => j !== imports[1]);
      if (rand() < 0.5 && rest.length > 0) imports.push(pick(rand, rest));
    }
    modules[k].imports = imports;
  }

  // Exact kind counts, hubs included, so every size holds the stated shares.
  const values = Math.round(size * 0.05);
  const factories = Math.round(size * 0.1);
  const kinds: ProviderKind[] = [
    'value',
    'factory',
    'class',
    ...shuffle(rand, [
      ...new Array<ProviderKind>(values - 1).fill('value'),
      ...new Array<ProviderKind>(factories - 1).fill('factory'),
      ...new Array<ProviderKind>(size - values - factories - 1).fill('class'),
    ]),
  ];

  const moduleOf = sizes.flatMap((n, k) => new Array<number>(n).fill(k));
  const visibleExports = modules.map((m) =>
    m.imports
      .flatMap((j) => modules[j].exports)
      .filter((d) => !HUBS.includes(d)),
  );
  const providers: ScaleProvider[] = [];
  for (let i = 0; i < size; i++) {
    const k = moduleOf[i];
    const deps: number[] = [];
    if (i === LOGGER) deps.push(CONFIG);
    else if (i > LOGGER && kinds[i] !== 'value') {
      const pools = [
        HUBS,
        visibleExports[k],
        range(starts[k], i).filter((d) => !HUBS.includes(d)),
      ];
      const want = drawCount(rand, MIXED_DEP_COUNTS);
      for (let slot = 0; slot < want; slot++) {
        const r = rand();
        const start = r < 0.25 ? 0 : r < 0.5 ? 1 : 2;
        if (!drawDep(rand, pools, start, deps)) break;
      }
    }
    providers.push(provider(i, size, kinds[i], deps, k));
  }
  return { providers, modules };
}

/** An index drawn with the given probabilities. */
function drawCount(rand: Rand, weights: readonly number[]): number {
  let r = rand();
  for (let k = 0; k < weights.length - 1; k++) {
    if (r < weights[k]) return k;
    r -= weights[k];
  }
  return weights.length - 1;
}

const MODULE_SIZE = 10;
const MODULE_EXPORTS = 3;

/**
 * n/10 modules of 10 classes. Module k > 0 imports one or two distinct
 * modules below it and every module exports its last 3 providers. Each
 * provider takes 1 dep (P 0.4) or 2 (P 0.6), each from its own module's
 * earlier providers or its imports' exports with even odds, so the mean
 * fan-out matches `wide` and `deep`.
 */
export function modular(size: number, seed = GRAPH_SEED): ScaleGraph {
  if (size % MODULE_SIZE !== 0)
    throw new Error(`modular needs a multiple of ${MODULE_SIZE}, got ${size}`);
  const rand = mulberry32(streamSeed('modular', size, seed));
  const count = size / MODULE_SIZE;
  const modules: ScaleModule[] = [];
  for (let k = 0; k < count; k++) {
    const imports: number[] = [];
    if (k > 0) {
      imports.push(randInt(rand, 0, k - 1));
      if (k > 1 && rand() < 0.5) {
        let other = randInt(rand, 0, k - 1);
        while (other === imports[0]) other = randInt(rand, 0, k - 1);
        imports.push(other);
      }
      imports.sort((a, b) => a - b);
    }
    const start = k * MODULE_SIZE;
    modules.push({
      name: padName('m', k, count),
      // The longest import chain below the module.
      tier: Math.max(-1, ...imports.map((j) => modules[j].tier)) + 1,
      imports,
      exports: range(start + MODULE_SIZE - MODULE_EXPORTS, start + MODULE_SIZE),
    });
  }
  const providers: ScaleProvider[] = [];
  for (let i = 0; i < size; i++) {
    const k = Math.floor(i / MODULE_SIZE);
    const deps: number[] = [];
    const pools = [
      range(k * MODULE_SIZE, i),
      modules[k].imports.flatMap((j) => modules[j].exports),
    ];
    const want = rand() < 0.4 ? 1 : 2;
    for (let slot = 0; slot < want; slot++)
      if (!drawDep(rand, pools, rand() < 0.5 ? 0 : 1, deps)) break;
    providers.push(provider(i, size, 'class', deps, k));
  }
  return assemble('modular', size, seed, providers, modules);
}
