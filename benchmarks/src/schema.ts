/**
 * The results files of spec 4.9, with section 14's changes: toolchain ids
 * are the cell ids of examples/toolchain-matrix/toolchains.json. Every
 * writer validates before it writes and every reader after it reads.
 * `schema` goes up on a breaking change, and `validate` rejects a version
 * it does not know.
 */
import type { PairedRatio, Stats } from '@nexusdi/bench-kit';

export type { PairedRatio, Stats };

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

export type Kind = 'matrix' | 'probes' | 'size' | 'timings' | 'build';

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

const CHECKS: Record<Kind, Check> = { matrix, probes, size, timings, build };

/** The design entries a published file must meet, with the minimum each needs. */
function minimums(kind: Kind): Array<[key: string, least: number]> {
  if (kind === 'timings')
    return [
      ['in-process', MINIMUM.measured],
      ['cold-start', MINIMUM.coldStart],
    ];
  if (kind === 'build')
    return [
      ['meridian-8', MINIMUM.rounds],
      ['scale-200', MINIMUM.rounds],
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
  const designs = (value as { design: Record<string, Design> }).design;
  for (const [key, least] of minimums(kind))
    if (designs[key].measured < least)
      fail(`${kind}.design.${key}.measured`, `at least ${least}`);
}
