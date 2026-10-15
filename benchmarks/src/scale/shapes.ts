/**
 * The graph shapes of the scale suite (spec 2026-10-01, sections 3 and 14).
 * Each takes a size and the graph seed and draws from its own stream.
 */
import { mulberry32 } from '@nexusdi/bench-kit';

import { GRAPH_SEED, streamSeed, type Shape } from './config.ts';
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
 * of its chain. Heads take no deps and second providers no extra, so the
 * mean fan-out sits below 1.6: 1.54 to 1.58 by size, within 0.05 of `wide`
 * at n >= 1,000. The two shapes differ mainly in depth.
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

/** [weight, lo, hi]: a bin of a histogram, drawn uniformly inside. */
type Bin = readonly [weight: number, lo: number, hi: number];

/**
 * The calibration of `mixed` against the census of 22 real applications
 * (spec section 15.1, measured 2026-10-15). Each constant cites the
 * measured figure it is tuned to; the spec's section 15 records the
 * ruling and the 32-seed spread.
 */

/** Module size: round(exp(ln 3 + 1.18 z)), clamped to 1..250. NestJS pool: 1,350 modules, median 3, mean 6; the largest module measured has 243 providers. */
const SIZE_MEDIAN = 3;
const SIZE_SIGMA = 1.18;
const MAX_MODULE = 250;
/** Tiers: max(4, round(sqrt M)). Fitted to the measured depth bands. */
const MIN_TIERS = 4;
/**
 * Imports beyond core are the draw minus one, from these bins. The pooled
 * NestJS mean is 4.4 imports per module, a ceiling: every `imports` entry
 * counts, library modules included. Only NexusDI expresses imports at
 * runtime, so a mean above the measured one would charge NexusDI work no
 * other library does.
 */
const IMPORT_BINS: readonly Bin[] = [
  [0.2, 1, 1],
  [0.25, 2, 2],
  [0.2, 3, 3],
  [0.25, 4, 6],
  [0.1, 7, 12],
];
/** An extra import comes from the two nearest lower tiers with this odds, else from any lower tier. Fitted to the closure bands. */
const NEAR_TIERS = 2;
const P_NEAR = 0.8;
/** Fan-out of a class or factory: the pooled histogram of 10,740 providers (immich excluded), no fitting. */
const FAN_BINS: readonly Bin[] = [
  [0.2, 0, 0],
  [0.27, 1, 1],
  [0.19, 2, 2],
  [0.1, 3, 3],
  [0.07, 4, 4],
  [0.11, 5, 8],
  [0.05, 9, 16],
  [0.01, 17, 48],
];
/** The cap on fan-out is min(48, round(sqrt n)): per-app maxima track sqrt n up to n8n (46 at 1,229), then flatten (twenty 36, Theia 31). */
const MAX_FAN_OUT = 48;
/** A dependency slot draws a hub, an export of an imported module, or an earlier own provider. Fitted to the closure, depth and fan-in bands. */
const P_HUB = 0.15;
const P_IMPORT = 0.6;
/** A module exports its last ceil(0.3 size) providers. Pooled NestJS exports over providers: 38%. */
const EXPORT_SHARE = 0.3;
/** Kind shares, exact counts: values 5% and factories 10% (Angular and Inversify apps 6 to 13%), aliases 5% (NestJS under 2%, bitwarden and gauzy-ui 8%, Theia 30%). */
const VALUE_SHARE = 0.05;
const FACTORY_SHARE = 0.1;
const ALIAS_SHARE = 0.05;
/** mixed-async lifts the lowest-index round(0.05 n) factories: measured async share 0 to 4%, all infrastructure at the bottom of the graph. */
const ASYNC_SHARE = 0.05;

/** A standard normal draw (Box-Muller), two rand() calls. */
function normal(rand: Rand): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** An integer drawn from the bins: a bin by weight, then uniform inside it. */
function drawBin(rand: Rand, bins: readonly Bin[]): number {
  let r = rand();
  for (const [weight, lo, hi] of bins) {
    if (r < weight) return randInt(rand, lo, hi);
    r -= weight;
  }
  const [, lo, hi] = bins[bins.length - 1];
  return randInt(rand, lo, hi);
}

/**
 * The calibrated shape: modules of log-normal size in max(4, round(sqrt M))
 * tiers. Core holds the config, clock and logger hubs; every other module
 * imports core, one module of the tier just below and the draw's extras,
 * mostly from the nearest tiers. A class or factory takes the measured
 * number of deps from the modules it can see.
 */
export function mixed(size: number, seed = GRAPH_SEED): ScaleGraph {
  const { providers, modules } = mixedStructure(size, seed);
  return assemble('mixed', size, seed, providers, modules);
}

/**
 * `mixed` with its lowest-index round(0.05 n) factories made async: the same
 * stream and structure, so the two differ in those kinds alone. Lowest index
 * is lowest tier, where every measured async factory sits; `clock` stays
 * async at every size.
 */
export function mixedAsync(size: number, seed = GRAPH_SEED): ScaleGraph {
  const { providers, modules } = mixedStructure(size, seed);
  let left = Math.round(size * ASYNC_SHARE);
  const lifted = providers.map((p) =>
    p.kind === 'factory' && left-- > 0
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
    const raw = Math.round(
      Math.exp(Math.log(SIZE_MEDIAN) + SIZE_SIGMA * normal(rand)),
    );
    // Core takes at least three providers, so the hubs fit.
    const least = sizes.length === 0 ? HUBS.length : 1;
    const drawn = Math.min(Math.max(raw, least), MAX_MODULE);
    const next = Math.min(drawn, size - total);
    sizes.push(next);
    total += next;
  }
  const count = sizes.length;
  const starts = sizes.map((_, k) =>
    sizes.slice(0, k).reduce((a, b) => a + b, 0),
  );
  const tiers = Math.max(MIN_TIERS, Math.round(Math.sqrt(count)));
  const tier = (k: number) => Math.floor((tiers * k) / count);

  const modules: ScaleModule[] = sizes.map((n, k) => {
    const own = range(starts[k], starts[k] + n);
    const last = own.slice(-Math.ceil(n * EXPORT_SHARE));
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
    // Core is imported already, so the others come from the other modules.
    const lower = range(1, k).filter((j) => tier(j) < t);
    const below = lower.filter((j) => tier(j) === t - 1);
    // When tier t-1 holds core alone, core is the import from it.
    if (below.length > 0) {
      imports.push(pick(rand, below));
      const extras = drawBin(rand, IMPORT_BINS) - 1;
      const rest = lower.filter((j) => j !== imports[1]);
      const near = rest.filter((j) => tier(j) >= t - NEAR_TIERS);
      for (let e = 0; e < extras; e++) {
        const from = rand() < P_NEAR ? near : rest;
        const pool = from.filter((j) => !imports.includes(j));
        const any = rest.filter((j) => !imports.includes(j));
        if (pool.length > 0) imports.push(pick(rand, pool));
        else if (any.length > 0) imports.push(pick(rand, any));
      }
    }
    modules[k].imports = imports;
  }

  // Exact kind counts, hubs included, so every size holds the stated shares.
  const values = Math.round(size * VALUE_SHARE);
  const factories = Math.round(size * FACTORY_SHARE);
  const aliases = Math.round(size * ALIAS_SHARE);
  const kinds: ProviderKind[] = [
    'value',
    'factory',
    'class',
    ...shuffle(rand, [
      ...new Array<ProviderKind>(values - 1).fill('value'),
      ...new Array<ProviderKind>(factories - 1).fill('factory'),
      ...new Array<ProviderKind>(aliases).fill('alias'),
      ...new Array<ProviderKind>(size - values - factories - aliases - 1).fill(
        'class',
      ),
    ]),
  ];

  const moduleOf = sizes.flatMap((n, k) => new Array<number>(n).fill(k));
  const visibleExports = modules.map((m) =>
    m.imports
      .flatMap((j) => modules[j].exports)
      .filter((d) => !HUBS.includes(d)),
  );
  const cap = Math.min(MAX_FAN_OUT, Math.round(Math.sqrt(size)));
  const providers: ScaleProvider[] = [];
  for (let i = 0; i < size; i++) {
    const k = moduleOf[i];
    const deps: number[] = [];
    const own = range(starts[k], i).filter((d) => !HUBS.includes(d));
    const kind = kinds[i];
    if (i === LOGGER) deps.push(CONFIG);
    else if (kind === 'alias') {
      // An alias points at one provider it can see: an earlier own provider or
      // an export of an import, else a hub, which core always exports. Like a
      // dependency slot, it reaches the hubs last, and the count stays exact.
      const pool = [...own, ...visibleExports[k]];
      deps.push(pick(rand, pool.length > 0 ? pool : HUBS));
    } else if (i > LOGGER && kind !== 'value') {
      const imported = visibleExports[k];
      // A slot falls through to the other non-hub pool before the hubs: an
      // empty own pool sent to the hubs, which are dead ends, would pin
      // the closure at a few percent.
      const orders = [
        [HUBS, imported, own],
        [imported, own, HUBS],
        [own, imported, HUBS],
      ];
      const want = Math.min(cap, drawBin(rand, FAN_BINS));
      for (let slot = 0; slot < want; slot++) {
        const r = rand();
        const start = r < P_HUB ? 0 : r < P_HUB + P_IMPORT ? 1 : 2;
        if (!drawDep(rand, orders[start], 0, deps)) break;
      }
    }
    providers.push(provider(i, size, kind, deps, k));
  }
  return { providers, modules };
}

const MODULE_SIZE = 10;
const MODULE_EXPORTS = 3;

/**
 * n/10 modules of 10 classes. Module k > 0 imports one or two distinct
 * modules below it and every module exports its last 3 providers. Each
 * provider takes 1 dep (P 0.4) or 2 (P 0.6), each from its own module's
 * earlier providers or its imports' exports with even odds. The mean fan-out
 * is 1.52 to 1.61 by size, within 0.02 of `wide`'s 1.6 at n >= 1,000.
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

const SHAPE_BUILDERS: Readonly<
  Record<Shape, (size: number, seed?: number) => ScaleGraph>
> = { wide, deep, mixed, 'mixed-async': mixedAsync, modular };

/** The graph of `shape` at `size`. */
export const graphOf = (shape: Shape, size: number, seed = GRAPH_SEED) =>
  SHAPE_BUILDERS[shape](size, seed);
