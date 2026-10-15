/**
 * A small scale.json and timing file for the render tests: mixed at the four
 * sizes, NexusDI plain slower than awilix and faster than tsyringe, and
 * tsyringe skipped at 1,000 and 5,000 with a runtime-error.
 */
import type {
  LibraryId,
  ScaleCell,
  ScaleFile,
  ScaleTimingRow,
  ScaleTimingsFile,
  Variant,
} from '../schema.ts';

const SIZES = [50, 200, 1000, 5000];
const ms = (x: number) => x * 1e6;

const LIBS: Array<{
  id: LibraryId;
  variant: Variant;
  /** Startup in ms per size; fewer entries means the library failed above. */
  startup: number[];
}> = [
  { id: 'nexusdi', variant: 'plain', startup: [4, 5, 9, 30] },
  { id: 'awilix', variant: 'plain', startup: [3, 3.5, 5, 14] },
  { id: 'tsyringe', variant: 'decorated', startup: [6, 7] },
];

const stats = (median: number) => ({
  median,
  mad: median / 50,
  p5: median * 0.9,
  p95: median * 1.2,
  iterations: 1000,
  noisy: false,
});

const hash = (size: number) => `h${size}`.padEnd(12, '0');

function cells(): ScaleCell[] {
  return LIBS.flatMap((l) =>
    SIZES.map((size, i): ScaleCell => {
      const ok = i < l.startup.length;
      return {
        library: l.id,
        variant: l.variant,
        shape: 'mixed',
        size,
        outcome: ok ? 'pass' : 'runtime-error',
        ...(ok
          ? {}
          : { message: 'RangeError: Maximum call stack size exceeded' }),
      };
    }),
  );
}

export function fixtureScale(): ScaleFile {
  return {
    schema: 1,
    versions: {
      core: '0.4.0-rc.1',
      libraries: {
        nexusdi: '0.4.0-rc.1',
        inversify: '8.2.3',
        tsyringe: '4.10.0',
        awilix: '13.0.5',
        'needle-di': '1.2.1',
      },
      toolchains: { tsc: '6.0.3' },
      node: '24.20.0',
      bundlers: { esbuild: '0.28.2' },
      tslib: '2.8.1',
    },
    graphSeed: 20261001,
    graphs: SIZES.map((size) => ({
      shape: 'mixed',
      size,
      hash: hash(size),
      providers: size,
      edges: size * 2,
      modules: size / 10,
      maxDepth: 10,
      meanFanOut: 1.9,
      maxFanOut: 4,
      maxFanIn: 20,
      kinds: {
        class: size - 10,
        factory: 5,
        'async-factory': 0,
        value: 5,
        alias: 0,
      },
      target: size - 2,
      targetClosure: 16,
    })),
    cells: cells(),
    sizes: LIBS.flatMap((l) =>
      SIZES.slice(0, l.startup.length).map((size) => ({
        library: l.id,
        variant: l.variant,
        shape: 'mixed' as const,
        size,
        minified: 1000 + size * 10,
        gzip: 400 + size * 4,
      })),
    ),
    perProvider: LIBS.filter((l) => l.startup.length === 4).flatMap((l) =>
      (['minified', 'gzip'] as const).map((bytes) => ({
        library: l.id,
        variant: l.variant,
        shape: 'mixed' as const,
        bytes,
        perProvider: bytes === 'gzip' ? 4 : 10,
      })),
    ),
  };
}

const design = (warmup: number, measured: number) => ({
  order: 'williams' as const,
  warmup,
  measured,
  bootstrap: {
    resamples: 10000 as const,
    block: 10,
    prng: 'mulberry32' as const,
  },
});

export function fixtureTimings(): ScaleTimingsFile {
  const nexus = LIBS[0]?.startup ?? [];
  const results: ScaleTimingRow[] = [];
  const growth: ScaleTimingsFile['growth'] = [];
  const marginal: ScaleTimingsFile['marginal'] = [];
  for (const l of LIBS) {
    l.startup.forEach((v, i) => {
      const size = SIZES[i] ?? 0;
      const row = (
        metric: ScaleTimingRow['metric'],
        value: number,
        unit: 'ns' | 'bytes' = 'ns',
        ratio = true,
      ) => {
        const r = (nexus[i] ?? 1) / v;
        results.push({
          metric,
          library: l.id,
          variant: l.variant,
          shape: 'mixed',
          size,
          toolchain: 'tsc',
          unit,
          batch: 1,
          stats: stats(value),
          ...(ratio && l.id !== 'nexusdi'
            ? {
                vsNexus: {
                  median: r,
                  low: r * 0.95,
                  high: r * 1.05,
                  pairs: 1000,
                },
              }
            : {}),
        });
      };
      row('startup', ms(v));
      row('first-resolve', ms(v * 0.8));
      row('ready', ms(v * 0.9));
      row('load', ms(v * 0.4), 'ns', false);
      row('create', ms(v * 0.3), 'ns', false);
      row('first-get', ms(v * 0.1), 'ns', false);
      row('rest', ms(v * 0.2), 'ns', false);
      row('heap-ready', size * 2048, 'bytes');
      if (i > 0) {
        const lo = l.startup[i - 1] ?? 1;
        for (const metric of ['startup', 'ready'] as const)
          growth.push({
            metric,
            library: l.id,
            variant: l.variant,
            shape: 'mixed',
            from: SIZES[i - 1] ?? 0,
            to: size,
            exponent: Math.log(v / lo) / Math.log(size / (SIZES[i - 1] ?? 1)),
            low: 0.5,
            high: 1.5,
          });
      }
    });
    if (l.startup.length === 4) {
      marginal.push(
        {
          metric: 'startup',
          library: l.id,
          variant: l.variant,
          shape: 'mixed',
          perProvider: ((l.startup[3] ?? 0) - (l.startup[2] ?? 0)) * 250,
        },
        {
          metric: 'heap-ready',
          library: l.id,
          variant: l.variant,
          shape: 'mixed',
          perProvider: 2048,
        },
      );
      for (const size of SIZES.slice(0, 4)) void size;
    }
  }
  return {
    schema: 1,
    sha: 'abc1234',
    startedAt: '2026-10-14T04:00:00Z',
    versions: fixtureScale().versions,
    runner: { os: 'Linux', cpu: 'Xeon', cores: 4, memoryGb: 16, hosted: true },
    seed: 7,
    graphSeed: 20261001,
    coreRef: {
      ref: 'workspace',
      tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    },
    graphs: SIZES.map((size) => ({ shape: 'mixed', size, hash: hash(size) })),
    cells: cells(),
    design: {
      'fresh-process': { mixed: design(10, 1000) },
      'steady-get': design(100, 1000),
    },
    results,
    growth,
    marginal,
  };
}
