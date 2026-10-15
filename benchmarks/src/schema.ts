/**
 * The results files of spec 4.9, with section 14's changes: toolchain ids
 * are the cell ids of examples/toolchain-matrix/toolchains.json. Every
 * writer validates before it writes and every reader after it reads.
 * `schema` goes up on a breaking change, and `validate` rejects a version
 * it does not know.
 */
import type { PairedRatio, Stats } from '@nexusdi/bench-kit';

import { PER_PROVIDER, SHAPES, SIZES, type Shape } from './scale/config.ts';
import { PROVIDER_KINDS, type ProviderKind } from './scale/graph.ts';

export type { PairedRatio, Stats, Shape };

export const LIBRARIES = [
  'nexusdi',
  'inversify',
  'tsyringe',
  'awilix',
  'needle-di',
] as const;
export type LibraryId = (typeof LIBRARIES)[number];

const VARIANTS = ['plain', 'decorated', 'decorated-explicit'] as const;
export type Variant = (typeof VARIANTS)[number];

const PROFILES = ['none', 'standard', 'legacy-metadata', 'legacy'] as const;
export type Profile = (typeof PROFILES)[number];

const OUTCOMES = [
  'pass',
  'compile-error',
  'runtime-error',
  'wrong-instance',
  'not-applicable',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PROBES = [
  'missing-provider',
  'cycle',
  'captive-scoped',
  'wrong-dep-type',
  'two-mistakes',
] as const;
export type Probe = (typeof PROBES)[number];

const DETECTED_AT = [
  'typecheck',
  'create',
  'first-resolve',
  'never',
  'not-applicable',
] as const;
export type DetectedAt = (typeof DETECTED_AT)[number];

const SCENARIOS = [
  'cold-start',
  'ready',
  'resolve-singleton',
  'resolve-transient',
  'scope-cycle',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface Versions {
  /** The packed @nexusdi/core version. */
  core: string;
  libraries: Record<LibraryId, string>;
  /** Cell id to its first package's version. */
  toolchains: Record<string, string>;
  node: string;
}

/** results/matrix.json: no timestamp, sorted, reproducible byte for byte. */
export interface MatrixFile {
  schema: 1;
  versions: Versions;
  /** Sorted by library, variant, toolchain. */
  cells: MatrixCell[];
}

export interface MatrixCell {
  library: LibraryId;
  variant: Variant;
  toolchain: string;
  profile: Profile;
  sections: { singleton: Outcome; transient: Outcome; scoped: Outcome };
  outcome: Outcome;
  /** For example 'reflect-metadata@0.2.2'. */
  polyfill: string | null;
  message?: string;
  /** URL of the page that documents the limitation. */
  documented?: string;
  /** For example Deno's deprecation warning. */
  note?: string;
}

export interface ProbeRow {
  library: LibraryId;
  variant: Variant;
  probe: Probe;
  detectedAt: DetectedAt;
  reported?: 0 | 1 | 2;
  message?: string;
}

/** results/probes.json */
export interface ProbesFile {
  schema: 1;
  versions: Versions;
  probes: ProbeRow[];
}

export interface SizeRow {
  library: LibraryId;
  variant: Variant;
  bundler: 'esbuild' | 'rollup';
  /** Bytes. */
  minified: number;
  /** Bytes, zlib level 9. */
  gzip: number;
  /** Bytes of the gzip total that the polyfill accounts for. */
  polyfillGzip: number;
  runs: Outcome;
}

export interface EmitRow {
  library: LibraryId;
  variant: Variant;
  fixture: 'scale-200';
  toolchain: 'tsc';
  /** Unminified JavaScript output, all files. */
  emittedBytes: number;
  /** `__metadata(` occurrences. */
  metadataCalls: number;
  /** `__decorate(` occurrences. */
  decorateCalls: number;
  importsInSource: number;
  /** Import declarations still present in the output. */
  importsKept: number;
}

/** results/size.json */
export interface SizeFile {
  schema: 1;
  versions: Versions & { bundlers: { esbuild: string; rollup: string } };
  sizes: SizeRow[];
  emit: EmitRow[];
}

export interface Design {
  order: 'williams';
  /** Iterations or rounds recorded and excluded. */
  warmup: number;
  measured: number;
  bootstrap: { resamples: 10000; block: number; prng: 'mulberry32' };
}

export interface Runner {
  os: string;
  cpu: string;
  cores: number;
  memoryGb: number;
  hosted: boolean;
}

export interface TimingRow {
  scenario: Scenario;
  library: LibraryId;
  variant: Variant;
  toolchain: 'tsc';
  /** N operations per sample; 1 for cold-start. */
  batch: number;
  /** ns per operation. */
  stats: Stats;
  /** cold-start only: the child's own performance.now(), ms. */
  childNow?: Stats;
  /** ready only, per operation. */
  heapBytes?: number;
  /** Competitor rows only. */
  vsNexus?: PairedRatio;
}

/** results/timings/<date>-<sha7>.json */
export interface TimingsFile {
  schema: 1;
  sha: string;
  /** ISO 8601. */
  startedAt: string;
  versions: Versions;
  runner: Runner;
  seed: number;
  design: Record<'cold-start' | 'in-process', Design>;
  results: TimingRow[];
}

export interface BuildMeasure extends Stats {
  /** Against NexusDI plain, same toolchain, fixture and round. */
  vsNexus?: PairedRatio;
}

/** The cell's own figures are the scale-200 build, the headline fixture. */
export interface BuildCell extends BuildMeasure {
  /** The matrix outcome of this cell. */
  outcome: Outcome;
  /** The library's fastest passing documented toolchain. */
  headline: boolean;
  'meridian-8': BuildMeasure;
}

/** results/build.json: rewritten by every published run; its git history is its history. */
export interface BuildFile {
  schema: 1;
  sha: string;
  /** ISO 8601. */
  startedAt: string;
  versions: Versions;
  runner: Runner;
  seed: number;
  design: Record<'meridian-8' | 'scale-200', Design>;
  /** build[library][variant][toolchain]; only cells with a build step appear. */
  build: Record<LibraryId, Partial<Record<Variant, Record<string, BuildCell>>>>;
  /**
   * The headline cell's toolchain, and for competitors the paired ratio of
   * NexusDI's headline scale-200 build to theirs within each round.
   */
  headline: Record<
    LibraryId,
    { variant: Variant; toolchain: string; vsNexus?: PairedRatio }
  >;
}

/** One generated graph as results/scale.json records it (scale spec 3.1). */
export interface ScaleGraphRow {
  shape: Shape;
  size: number;
  /** The first 12 hex digits of the SHA-256 of the canonical graph. */
  hash: string;
  providers: number;
  edges: number;
  modules: number;
  maxDepth: number;
  /** Rounded to 0.01. */
  meanFanOut: number;
  maxFanOut: number;
  maxFanIn: number;
  kinds: Record<ProviderKind, number>;
  target: number;
  targetClosure: number;
}

/** The outcome of one library-variant on one graph. */
export interface ScaleCell {
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  size: number;
  outcome: Outcome;
  /** The failure, or for not-applicable the reason from libraries.json. */
  message?: string;
}

/** Bundle bytes of one `mixed` cell, core D12's esbuild flags (scale spec 6.3). */
export interface ScaleSizeRow {
  library: LibraryId;
  variant: Variant;
  shape: 'mixed';
  size: number;
  /** Bytes. */
  minified: number;
  /** Bytes, zlib level 9. */
  gzip: number;
}

/** (bytes at 5,000 - bytes at 1,000) / 4,000: the marginal bytes of one provider. */
export interface ScalePerProvider {
  library: LibraryId;
  variant: Variant;
  shape: 'mixed';
  bytes: 'minified' | 'gzip';
  /** Rounded to 0.01. */
  perProvider: number;
}

/** results/scale.json: no timestamp, sorted, reproducible byte for byte. */
export interface ScaleFile {
  schema: 1;
  versions: Versions & { bundlers: { esbuild: string }; tslib: string };
  graphSeed: number;
  /** Sorted by shape in SHAPES order, then size. */
  graphs: ScaleGraphRow[];
  /** Sorted by library, variant, shape (SHAPES order), size. */
  cells: ScaleCell[];
  /** Sorted by library, variant, size. */
  sizes: ScaleSizeRow[];
  /** Sorted by library, variant, then minified before gzip. */
  perProvider: ScalePerProvider[];
}

const SCALE_METRICS = [
  'load',
  'create',
  'first-get',
  'rest',
  'first-resolve',
  'ready',
  'startup',
  'heap-ready',
  'get-cycle',
] as const;
export type ScaleMetric = (typeof SCALE_METRICS)[number];

/**
 * The metrics published with a paired ratio against NexusDI plain. The
 * phases are not: NexusDI builds its singletons in create and the others
 * on get, so a ratio on one phase compares different work (ruling 3).
 */
export const SCALE_RATIO_METRICS: readonly ScaleMetric[] = [
  'first-resolve',
  'ready',
  'startup',
  'heap-ready',
  'get-cycle',
];

export interface ScaleTimingRow {
  metric: ScaleMetric;
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  size: number;
  toolchain: 'tsc';
  /** bytes for heap-ready, ns for every other metric. */
  unit: 'ns' | 'bytes';
  /** Operations per sample: 1 for fresh-process metrics. */
  batch: number;
  stats: Stats;
  /** Competitor rows of SCALE_RATIO_METRICS only. */
  vsNexus?: PairedRatio;
}

/** The local growth exponent between two adjacent sizes (scale spec 6.4). */
export interface ScaleGrowth {
  metric: 'startup' | 'ready';
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  from: number;
  to: number;
  exponent: number;
  low: number;
  high: number;
}

export interface ScaleMarginal {
  metric: 'startup' | 'heap-ready';
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  /** ns or bytes per provider between 1,000 and 5,000. */
  perProvider: number;
}

/** One double ratio of the protocol check (scale spec 7.4). */
export interface ProtocolDouble {
  library: LibraryId;
  size: number;
  /** NexusDI's per-round shift between two modes over the library's, on startup. */
  ratio: PairedRatio;
  /** Median within 2% of 1, or an interval that contains 1. */
  pass: boolean;
}

/**
 * The paired check of the first dispatch run: every `mixed` cell in the heap
 * mode (the old protocol), the timing mode and the timing mode without the
 * gc() before create.
 */
export interface ProtocolCheck {
  /** Measured rounds. */
  rounds: number;
  timingVsHeap: ProtocolDouble[];
  noGcVsTiming: ProtocolDouble[];
  /** Every timing-over-heap double ratio passes. */
  timingStands: boolean;
  /** `drop` when mode N moved a library against NexusDI by more than 2%. */
  gcBeforeCreate: 'keep' | 'drop';
}

/** The maximum relative interval width of a block's metric set at a prefix of its rounds (scale spec 7.4). */
export interface PrefixWidth {
  shape: Shape;
  rounds: number;
  maxWidth: number;
  /** The metric that has the maximum. */
  metric: string;
}

/** Where a block ran: the CPU and runner image differ between jobs. */
export interface BlockRunner extends Runner {
  imageOs?: string;
  imageVersion?: string;
  kernel: string;
}

/** One block's machine and wall time (`steady-get` is the get-cycle part). */
export interface ScaleBlockInfo {
  block: Shape | 'steady-get';
  runner: BlockRunner;
  wallMs: number;
}

/** results/scale/<date>-<sha7>.json */
export interface ScaleTimingsFile {
  schema: 1;
  sha: string;
  /** ISO 8601. */
  startedAt: string;
  versions: Versions;
  seed: number;
  graphSeed: number;
  /** SHA-256 of the scale.json the run validated against. */
  scaleSha256: string;
  /** The machine and wall time of each block, since each shape runs in its own job. */
  blocks: ScaleBlockInfo[];
  /**
   * The core the run packed (scale spec 14 item 5): the ref passed to
   * release-core.ts --ref, or 'workspace', and the git tree SHA of
   * libs/core. A core fix need not change the version string, so the
   * version alone cannot tell two runs apart.
   */
  coreRef: { ref: string; tree: string };
  /** Shape, size and hash of every graph timed, matching scale.json. */
  graphs: Array<{ shape: Shape; size: number; hash: string }>;
  /**
   * Every cell the run attempted, pass and not-applicable included. A
   * competitor cell that passed at n = 50 and failed at a larger size is
   * skipped: it has no rows here and its outcome and message are the record
   * (scale spec 14). `message` is required when the outcome is not `pass`.
   */
  cells: ScaleCell[];
  /**
   * One fresh-process design per shape, so each records its own round count,
   * and its heap block's: heap-ready comes from a serial block of its own
   * (scale spec 7.1).
   */
  design: {
    'fresh-process': Partial<Record<Shape, Design & { heap?: Design }>>;
    'steady-get': Design;
    /** The child mode the fresh-process timing blocks ran in (scale spec 7.4). */
    timingMode: 'timing' | 'timing-no-gc';
  };
  results: ScaleTimingRow[];
  growth: ScaleGrowth[];
  marginal: ScaleMarginal[];
  /** The width of each block's metric set at prefixes of its rounds (scale spec 7.4). */
  prefixWidths?: PrefixWidth[];
  /** The paired protocol check, on the first dispatch run only (scale spec 7.4). */
  protocolCheck?: ProtocolCheck;
}

export type Kind =
  | 'matrix'
  | 'probes'
  | 'size'
  | 'timings'
  | 'build'
  | 'scale'
  | 'scale-timings';

/** The published minimum design (spec 14.4). A quick run is below it. */
const MINIMUM = { measured: 1000, coldStart: 1000, rounds: 30 } as const;

export class SchemaError extends Error {}

type Check = (v: unknown, at: string) => void;

const fail = (at: string, want: string): never => {
  throw new SchemaError(`${at}: expected ${want}`);
};
const oneOf =
  (...xs: readonly string[]): Check =>
  (v, at) => {
    if (typeof v !== 'string' || !xs.includes(v)) fail(at, xs.join(' | '));
  };
const literal =
  (x: unknown): Check =>
  (v, at) => {
    if (v !== x) fail(at, JSON.stringify(x));
  };
const num: Check = (v, at) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(at, 'a finite number');
};
const str: Check = (v, at) => {
  if (typeof v !== 'string') fail(at, 'a string');
};
const bool: Check = (v, at) => {
  if (typeof v !== 'boolean') fail(at, 'a boolean');
};
const opt =
  (c: Check): Check =>
  (v, at) => {
    if (v !== undefined) c(v, at);
  };
const nullable =
  (c: Check): Check =>
  (v, at) => {
    if (v !== null) c(v, at);
  };
const arr =
  (c: Check): Check =>
  (v, at) => {
    if (!Array.isArray(v)) fail(at, 'an array');
    (v as unknown[]).forEach((x, i) => c(x, `${at}[${i}]`));
  };
const obj =
  (shape: Record<string, Check>): Check =>
  (v, at) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      fail(at, 'an object');
    for (const [k, c] of Object.entries(shape))
      c((v as Record<string, unknown>)[k], `${at}.${k}`);
  };
const record =
  (c: Check, keys?: readonly string[]): Check =>
  (v, at) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      fail(at, 'an object');
    for (const [k, x] of Object.entries(v as object)) {
      if (keys !== undefined && !keys.includes(k))
        fail(`${at}.${k}`, `a key in ${keys.join(' | ')}`);
      c(x, `${at}.${k}`);
    }
  };

const library = oneOf(...LIBRARIES);
const variant = oneOf(...VARIANTS);
const outcome = oneOf(...OUTCOMES);

const versions = obj({
  core: str,
  libraries: obj(Object.fromEntries(LIBRARIES.map((l) => [l, str]))),
  toolchains: record(str),
  node: str,
});

const stats = obj({
  median: num,
  mad: num,
  p5: num,
  p95: num,
  iterations: num,
  noisy: bool,
});

const pairedRatio = obj({ median: num, low: num, high: num, pairs: num });

const design = obj({
  order: literal('williams'),
  warmup: num,
  measured: num,
  bootstrap: obj({
    resamples: literal(10000),
    block: num,
    prng: literal('mulberry32'),
  }),
});

const runner = obj({
  os: str,
  cpu: str,
  cores: num,
  memoryGb: num,
  hosted: bool,
});

const matrix = obj({
  schema: literal(1),
  versions,
  cells: arr(
    obj({
      library,
      variant,
      toolchain: str,
      profile: oneOf(...PROFILES),
      sections: obj({
        singleton: outcome,
        transient: outcome,
        scoped: outcome,
      }),
      outcome,
      polyfill: nullable(str),
      message: opt(str),
      documented: opt(str),
      note: opt(str),
    }),
  ),
});

const probes = obj({
  schema: literal(1),
  versions,
  probes: arr(
    obj({
      library,
      variant,
      probe: oneOf(...PROBES),
      detectedAt: oneOf(...DETECTED_AT),
      reported: opt((v, at) => {
        if (v !== 0 && v !== 1 && v !== 2) fail(at, '0 | 1 | 2');
      }),
      message: opt(str),
    }),
  ),
});

const size = obj({
  schema: literal(1),
  versions: (v, at) => {
    versions(v, at);
    obj({ bundlers: obj({ esbuild: str, rollup: str }) })(v, at);
  },
  sizes: arr(
    obj({
      library,
      variant,
      bundler: oneOf('esbuild', 'rollup'),
      minified: num,
      gzip: num,
      polyfillGzip: num,
      runs: outcome,
    }),
  ),
  emit: arr(
    obj({
      library,
      variant,
      fixture: literal('scale-200'),
      toolchain: literal('tsc'),
      emittedBytes: num,
      metadataCalls: num,
      decorateCalls: num,
      importsInSource: num,
      importsKept: num,
    }),
  ),
});

const timings = obj({
  schema: literal(1),
  sha: str,
  startedAt: str,
  versions,
  runner,
  seed: num,
  design: obj({ 'cold-start': design, 'in-process': design }),
  results: arr(
    obj({
      scenario: oneOf(...SCENARIOS),
      library,
      variant,
      toolchain: literal('tsc'),
      batch: num,
      stats,
      childNow: opt(stats),
      heapBytes: opt(num),
      vsNexus: opt(pairedRatio),
    }),
  ),
});

const buildMeasure: Check = (v, at) => {
  stats(v, at);
  obj({ vsNexus: opt(pairedRatio) })(v, at);
};

const build = obj({
  schema: literal(1),
  sha: str,
  startedAt: str,
  versions,
  runner,
  seed: num,
  design: obj({ 'meridian-8': design, 'scale-200': design }),
  build: record(
    record(
      record((v, at) => {
        buildMeasure(v, at);
        obj({ outcome, headline: bool, 'meridian-8': buildMeasure })(v, at);
      }),
      VARIANTS,
    ),
    LIBRARIES,
  ),
  headline: record(
    obj({ variant, toolchain: str, vsNexus: opt(pairedRatio) }),
    LIBRARIES,
  ),
});

const shape = oneOf(...SHAPES);

const scale = obj({
  schema: literal(1),
  versions: (v, at) => {
    versions(v, at);
    obj({ bundlers: obj({ esbuild: str }), tslib: str })(v, at);
  },
  graphSeed: num,
  graphs: arr(
    obj({
      shape,
      size: num,
      hash: str,
      providers: num,
      edges: num,
      modules: num,
      maxDepth: num,
      meanFanOut: num,
      maxFanOut: num,
      maxFanIn: num,
      kinds: obj(Object.fromEntries(PROVIDER_KINDS.map((k) => [k, num]))),
      target: num,
      targetClosure: num,
    }),
  ),
  cells: arr(
    obj({ library, variant, shape, size: num, outcome, message: opt(str) }),
  ),
  sizes: arr(
    obj({
      library,
      variant,
      shape: literal('mixed'),
      size: num,
      minified: num,
      gzip: num,
    }),
  ),
  perProvider: arr(
    obj({
      library,
      variant,
      shape: literal('mixed'),
      bytes: oneOf('minified', 'gzip'),
      perProvider: num,
    }),
  ),
});

const scaleTimingRow: Check = (v, at) => {
  obj({
    metric: oneOf(...SCALE_METRICS),
    library,
    variant,
    shape,
    size: num,
    toolchain: literal('tsc'),
    unit: oneOf('ns', 'bytes'),
    batch: num,
    stats,
    vsNexus: opt(pairedRatio),
  })(v, at);
  const row = v as ScaleTimingRow;
  literal(row.metric === 'heap-ready' ? 'bytes' : 'ns')(row.unit, `${at}.unit`);
  if (row.vsNexus !== undefined && !SCALE_RATIO_METRICS.includes(row.metric))
    fail(`${at}.vsNexus`, `no paired ratio on ${row.metric}`);
};

/** A timed cell: a message says why it did not pass. */
const timedCell: Check = (v, at) => {
  obj({ library, variant, shape, size: num, outcome, message: opt(str) })(
    v,
    at,
  );
  const cell = v as ScaleCell;
  if (cell.outcome !== 'pass' && cell.message === undefined)
    fail(`${at}.message`, `a reason for outcome ${cell.outcome}`);
};

/** The cells of a timing file, by library, variant, shape and size. */
const cellKey = (c: {
  library: string;
  variant: string;
  shape: string;
  size: number;
}) => `${c.library}/${c.variant} ${c.shape} ${c.size}`;

/** Every row, growth pair and marginal figure rests on cells that passed. */
function checkCellsBehindRows(file: ScaleTimingsFile): void {
  const outcomes = new Map<string, string>();
  file.cells.forEach((c, i) => {
    if (outcomes.has(cellKey(c)))
      fail(
        `scale-timings.cells[${i}]`,
        `a cell not listed before: ${cellKey(c)}`,
      );
    outcomes.set(cellKey(c), c.outcome);
  });
  const needs = (at: string, c: Parameters<typeof cellKey>[0]) => {
    const got = outcomes.get(cellKey(c));
    if (got !== 'pass')
      fail(at, `a passing cell for ${cellKey(c)}, found ${got ?? 'none'}`);
  };
  file.results.forEach((r, i) => needs(`scale-timings.results[${i}]`, r));
  file.growth.forEach((g, i) => {
    const sizes: readonly number[] = SIZES;
    if (!sizes.includes(g.from))
      fail(`scale-timings.growth[${i}].from`, `one of ${sizes.join(', ')}`);
    const next = sizes[sizes.indexOf(g.from) + 1];
    if (g.to !== next)
      fail(
        `scale-timings.growth[${i}].to`,
        next === undefined
          ? `no pair from ${g.from}`
          : `${next}, the size after ${g.from}`,
      );
    needs(`scale-timings.growth[${i}]`, { ...g, size: g.from });
    needs(`scale-timings.growth[${i}]`, { ...g, size: g.to });
  });
  file.marginal.forEach((m, i) => {
    needs(`scale-timings.marginal[${i}]`, { ...m, size: PER_PROVIDER.from });
    needs(`scale-timings.marginal[${i}]`, { ...m, size: PER_PROVIDER.to });
  });
}

const blockRunner = obj({
  os: str,
  cpu: str,
  cores: num,
  memoryGb: num,
  hosted: bool,
  imageOs: opt(str),
  imageVersion: opt(str),
  kernel: str,
});

/** A fresh-process design with its heap block's design beside it. */
const freshDesign: Check = (v, at) => {
  design(v, at);
  opt(design)((v as { heap?: unknown }).heap, `${at}.heap`);
};

const protocolDouble = obj({
  library,
  size: num,
  ratio: pairedRatio,
  pass: bool,
});

const scaleTimingsShape = obj({
  schema: literal(1),
  sha: str,
  startedAt: str,
  versions,
  seed: num,
  graphSeed: num,
  scaleSha256: str,
  blocks: arr(
    obj({
      block: oneOf(...SHAPES, 'steady-get'),
      runner: blockRunner,
      wallMs: num,
    }),
  ),
  coreRef: obj({ ref: str, tree: str }),
  graphs: arr(obj({ shape, size: num, hash: str })),
  cells: arr(timedCell),
  design: obj({
    'fresh-process': record(freshDesign, SHAPES),
    'steady-get': design,
    timingMode: oneOf('timing', 'timing-no-gc'),
  }),
  prefixWidths: opt(
    arr(obj({ shape, rounds: num, maxWidth: num, metric: str })),
  ),
  protocolCheck: opt(
    obj({
      rounds: num,
      timingVsHeap: arr(protocolDouble),
      noGcVsTiming: arr(protocolDouble),
      timingStands: bool,
      gcBeforeCreate: oneOf('keep', 'drop'),
    }),
  ),
  results: arr(scaleTimingRow),
  growth: arr(
    obj({
      metric: oneOf('startup', 'ready'),
      library,
      variant,
      shape,
      from: num,
      to: num,
      exponent: num,
      low: num,
      high: num,
    }),
  ),
  marginal: arr(
    obj({
      metric: oneOf('startup', 'heap-ready'),
      library,
      variant,
      shape,
      perProvider: num,
    }),
  ),
});

/**
 * The cells of a published run hold judgeCells' invariants: NexusDI plain
 * passes everywhere, and a competitor's non-pass outcome is not-applicable,
 * or a runtime-error or compile-error at a size other than 50 where the same
 * library, variant and shape passes at 50 in the file. Anything else is a
 * harness fault that must not be published as a scaling result.
 */
function checkPublishedCells(file: ScaleTimingsFile): void {
  // A timing mode that moved NexusDI against a competitor (scale spec 7.4)
  // is not published: its figures rest on a protocol the check rejected.
  const check = file.protocolCheck;
  if (check !== undefined) {
    // The stored verdicts are recomputed from the ratios (scale spec 7.4).
    const passes = (r: PairedRatio) =>
      Math.abs(r.median - 1) <= 0.02 || (r.low <= 1 && r.high >= 1);
    for (const key of ['timingVsHeap', 'noGcVsTiming'] as const)
      check[key].forEach((d, i) => {
        if (d.pass !== passes(d.ratio))
          fail(
            `scale-timings.protocolCheck.${key}[${i}].pass`,
            String(passes(d.ratio)),
          );
      });
    const stands = check.timingVsHeap.every((d) => passes(d.ratio));
    if (check.timingStands !== stands)
      fail('scale-timings.protocolCheck.timingStands', String(stands));
    const gc = check.noGcVsTiming.every((d) => passes(d.ratio))
      ? 'keep'
      : 'drop';
    if (check.gcBeforeCreate !== gc)
      fail('scale-timings.protocolCheck.gcBeforeCreate', gc);
    if (!check.timingStands)
      fail(
        'scale-timings.protocolCheck.timingStands',
        'true: the timing figures of a failed protocol check are not published',
      );
    if (check.gcBeforeCreate === 'drop' && file.design.timingMode === 'timing')
      fail(
        'scale-timings.design.timingMode',
        'timing-no-gc: the protocol check dropped the gc() before create',
      );
  }
  const passes = new Set(
    file.cells.filter((c) => c.outcome === 'pass').map(cellKey),
  );
  file.cells.forEach((c, i) => {
    const at = `scale-timings.cells[${i}]`;
    if (c.outcome === 'pass' || c.outcome === 'not-applicable') return;
    if (c.library === 'nexusdi' && c.variant === 'plain')
      fail(at, `NexusDI plain to pass at ${c.shape} ${c.size}`);
    const scaling =
      (c.outcome === 'runtime-error' || c.outcome === 'compile-error') &&
      c.size !== 50 &&
      passes.has(cellKey({ ...c, size: 50 }));
    if (!scaling)
      fail(
        at,
        `${cellKey(c)} to pass, be not-applicable, or fail by runtime-error or compile-error above n = 50 after a pass at 50, found ${c.outcome}`,
      );
  });
}

const scaleTimings: Check = (v, at) => {
  scaleTimingsShape(v, at);
  checkCellsBehindRows(v as ScaleTimingsFile);
};

const CHECKS: Record<Kind, Check> = {
  matrix,
  probes,
  size,
  timings,
  build,
  scale,
  'scale-timings': scaleTimings,
};

/**
 * Published minimum of fresh-process rounds per shape (scale spec 14.3 and
 * ruling 1). These are literals so that lowering a run's own `ROUNDS` cannot
 * lower the minimum a published file must meet.
 */
/** Published minimum of measured heap-block rounds per shape (scale spec 7.1). */
const SCALE_HEAP_ROUNDS = 30;

export const SCALE_MINIMUM_ROUNDS: Readonly<Record<Shape, number>> = {
  mixed: 1000,
  wide: 200,
  deep: 200,
  modular: 200,
  'mixed-async': 200,
};

/**
 * The design entries a published file must meet, by their path under
 * `design`, with the minimum each needs. A scale run's `mixed` block meets
 * the published minimum; the secondary shapes run fewer rounds and print
 * their count (scale spec ruling 1 and section 14).
 */
function minimums(kind: Kind): Array<[path: string[], least: number]> {
  if (kind === 'timings')
    return [
      [['in-process'], MINIMUM.measured],
      [['cold-start'], MINIMUM.coldStart],
    ];
  if (kind === 'build')
    return [
      [['meridian-8'], MINIMUM.rounds],
      [['scale-200'], MINIMUM.rounds],
    ];
  if (kind === 'scale-timings')
    return [
      ...SHAPES.map((s): [string[], number] => [
        ['fresh-process', s],
        SCALE_MINIMUM_ROUNDS[s],
      ]),
      // heap-ready comes from a serial block of at least 30 measured rounds.
      ...SHAPES.map((s): [string[], number] => [
        ['fresh-process', s, 'heap'],
        SCALE_HEAP_ROUNDS,
      ]),
      [['steady-get'], MINIMUM.measured],
    ];
  return [];
}

/**
 * Checks `value` as a results file of `kind`, or throws a SchemaError that
 * names the JSON path. Under `results/` a file must also meet the published
 * design; a `--quick` run writes under `tmp/` and may not.
 */
export function validate(
  kind: Kind,
  value: unknown,
  where: 'results' | 'tmp',
): void {
  CHECKS[kind](value, kind);
  if (where !== 'results') return;
  if (kind === 'scale-timings') checkPublishedCells(value as ScaleTimingsFile);
  const designs = (value as { design?: unknown }).design;
  for (const [path, least] of minimums(kind)) {
    const at = `${kind}.design.${path.join('.')}`;
    const entry = path.reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      designs,
    ) as Design | undefined;
    if (entry === undefined) fail(at, `a design of at least ${least} measured`);
    else if (entry.measured < least)
      fail(`${at}.measured`, `at least ${least}`);
  }
}
