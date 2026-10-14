/**
 * The scale suite's orchestrator (scale spec sections 6, 7 and 8.2): one
 * fresh-process block per shape, the steady get-cycle on `mixed`, and the
 * statistics over both. Writes results/scale/<date>-<sha7>.json and
 * results/raw/scale-<date>-<sha7>.json.gz.
 *
 *   node src/scale/timings.ts                       a full run under results/
 *   node src/scale/timings.ts --quick               3 warm-up, 10 measured, 200 steady; tmp/
 *   node src/scale/timings.ts --only=a,b            those libraries and NexusDI; tmp/
 *   node src/scale/timings.ts --sizes=50 --shapes=mixed
 *   node src/scale/timings.ts --core-ref=<ref>      the ref in coreRef; default the one release-core.ts wrote to tmp/core-ref, else workspace
 *   node src/scale/timings.ts --seed=n
 *
 * Every cell is rendered, compiled, bundled and verified first, and the run
 * stops before sampling when one does not pass.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  blockSize,
  forkWorker,
  interleave,
  pairedRatio,
  summarize,
  type Worker,
} from '@nexusdi/bench-kit';

import { gitSha, runnerInfo } from '../build.ts';
import {
  argValue,
  onlyArg,
  seedArg,
  selectLibraries,
  shapesArg,
  sizesArg,
  withConsumer,
} from '../cli.ts';
import { tslibVersion } from '../consumer.ts';
import { ROOT } from '../consumer.ts';
import { BENCHMARKS } from '../libraries.ts';
import { versionsOf } from '../matrix.ts';
import { readCoreRef } from '../release-core.ts';
import {
  validate,
  type Design,
  type LibraryId,
  type Outcome,
  type ScaleGrowth,
  type ScaleMarginal,
  type ScaleMetric,
  type ScaleTimingRow,
  type ScaleTimingsFile,
  type Variant,
  SCALE_RATIO_METRICS,
} from '../schema.ts';
import { checkFloor } from '../timings/floor.ts';
import { pool, scaleCell, type CellResult } from './cells.ts';
import { documentedVariant } from './deterministic.ts';
import { GRAPH_SEED, ROUNDS, SHAPES, SIZES, type Shape } from './config.ts';
import { freshBlock, type FreshRow } from './fresh.ts';
import { describeGraph } from './graph.ts';
import { localExponent, marginalPerProvider } from './growth.ts';
import { graphOf } from './shapes.ts';

/** One cell of a fresh-process block: its rounds, and whether it ran. */
export interface RawScaleCell extends Omit<FreshRow, 'library'> {
  library: LibraryId;
  variant: Variant;
  /** Only a `pass` has rounds; a not-applicable cell has none and yields no rows. */
  outcome: Outcome;
}

export interface RawBlock {
  shape: Shape;
  warmup: number;
  measured: number;
  cells: RawScaleCell[];
}

/** One library's steady get-cycle at one size on `mixed`, ns per operation. */
export interface RawSteady {
  library: LibraryId;
  variant: Variant;
  size: number;
  batch: number;
  warmup: number[];
  measured: number[];
}

export interface ScaleRaw {
  blocks: RawBlock[];
  steady: RawSteady[];
}

/** The fresh-process metrics, the field of a FreshRow each reads, and its unit. */
const FRESH: ReadonlyArray<
  [ScaleMetric, keyof FreshRow & string, 'ns' | 'bytes']
> = [
  ['load', 'load', 'ns'],
  ['create', 'create', 'ns'],
  ['first-get', 'firstGet', 'ns'],
  ['rest', 'rest', 'ns'],
  ['first-resolve', 'firstResolve', 'ns'],
  ['ready', 'ready', 'ns'],
  ['startup', 'startup', 'ns'],
  ['heap-ready', 'heapReady', 'bytes'],
];

const isReference = (c: { library: string; variant: string }) =>
  c.library === 'nexusdi' && c.variant === 'plain';

/**
 * One row per cell and metric, with each competitor's paired ratio against
 * NexusDI plain (its figure over the competitor's) on the published ratio
 * metrics. Pairs come from the same block, size and round. A cell that did
 * not pass has no rounds and no rows. The derived metrics are the per-round
 * sums fresh.ts made, so their medians are medians of sums.
 */
export function toScaleRows(raw: ScaleRaw, seed: number): ScaleTimingRow[] {
  const rows: ScaleTimingRow[] = [];
  const push = (
    metric: ScaleMetric,
    unit: 'ns' | 'bytes',
    c: { library: LibraryId; variant: Variant },
    shape: Shape,
    size: number,
    batch: number,
    samples: readonly number[],
    reference: readonly number[] | undefined,
  ) => {
    const row: ScaleTimingRow = {
      metric,
      library: c.library,
      variant: c.variant,
      shape,
      size,
      toolchain: 'tsc',
      unit,
      batch,
      stats: summarize(samples),
    };
    if (
      reference !== undefined &&
      !isReference(c) &&
      SCALE_RATIO_METRICS.includes(metric)
    )
      row.vsNexus = pairedRatio(reference, samples, seed);
    rows.push(row);
  };
  for (const block of raw.blocks) {
    const passing = block.cells.filter((c) => c.outcome === 'pass');
    for (const c of passing) {
      const nexus = passing.find((n) => isReference(n) && n.size === c.size);
      for (const [metric, field, unit] of FRESH)
        push(
          metric,
          unit,
          c,
          block.shape,
          c.size,
          1,
          c[field] as number[],
          nexus === undefined ? undefined : (nexus[field] as number[]),
        );
    }
  }
  for (const s of raw.steady) {
    const nexus = raw.steady.find((n) => isReference(n) && n.size === s.size);
    push(
      'get-cycle',
      'ns',
      s,
      'mixed',
      s.size,
      s.batch,
      s.measured,
      nexus?.measured,
    );
  }
  return rows;
}

/** The passing cells of each library-variant in a block, ascending by size. */
function perLibrary(block: RawBlock): RawScaleCell[][] {
  const groups = new Map<string, RawScaleCell[]>();
  for (const c of block.cells)
    if (c.outcome === 'pass')
      groups.set(`${c.library}/${c.variant}`, [
        ...(groups.get(`${c.library}/${c.variant}`) ?? []),
        c,
      ]);
  return [...groups.values()].map((g) => g.sort((a, b) => a.size - b.size));
}

/** The local exponent of `startup` and `ready` for each adjacent pair of sizes (spec 6.4). */
export function toScaleGrowth(raw: ScaleRaw, seed: number): ScaleGrowth[] {
  const out: ScaleGrowth[] = [];
  for (const block of raw.blocks)
    for (const sizes of perLibrary(block))
      for (const metric of ['startup', 'ready'] as const)
        for (let i = 1; i < sizes.length; i++) {
          const lo = sizes[i - 1];
          const hi = sizes[i];
          if (lo === undefined || hi === undefined) continue;
          out.push({
            metric,
            library: lo.library,
            variant: lo.variant,
            shape: block.shape,
            from: lo.size,
            to: hi.size,
            ...localExponent(lo[metric], hi[metric], lo.size, hi.size, seed),
          });
        }
  return out;
}

/** ns (`startup`) or bytes (`heap-ready`) per provider between 1,000 and 5,000. */
export function toScaleMarginal(raw: ScaleRaw): ScaleMarginal[] {
  const out: ScaleMarginal[] = [];
  for (const block of raw.blocks)
    for (const lo of block.cells.filter(
      (c) => c.outcome === 'pass' && c.size === 1000,
    )) {
      const hi = block.cells.find(
        (c) =>
          c.outcome === 'pass' &&
          c.size === 5000 &&
          c.library === lo.library &&
          c.variant === lo.variant,
      );
      if (hi === undefined) continue;
      for (const [metric, field] of [
        ['startup', 'startup'],
        ['heap-ready', 'heapReady'],
      ] as const)
        out.push({
          metric,
          library: lo.library,
          variant: lo.variant,
          shape: block.shape,
          perProvider: marginalPerProvider(lo[field], hi[field]),
        });
    }
  return out;
}

/**
 * The git tree SHA of the libs/core in `root`'s working tree, which is what
 * release-core.ts leaves checked out (it restores the worktree, not HEAD).
 * Hashes the non-ignored files through a throwaway index, so the real index
 * and the working tree stay as they are.
 */
export function coreTree(root = ROOT): string {
  const scratch = mkdtempSync(join(tmpdir(), 'core-tree-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') };
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  try {
    git('add', '-A', '--', 'libs/core');
    return git('write-tree', '--prefix=libs/core/');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function design(warmup: number, measured: number): Design {
  return {
    order: 'williams',
    warmup,
    measured,
    bootstrap: {
      resamples: 10000,
      block: blockSize(measured),
      prng: 'mulberry32',
    },
  };
}

export interface ScaleRunOptions {
  only?: LibraryId[];
  sizes?: readonly number[];
  shapes?: readonly Shape[];
  quick: boolean;
  seed: number;
}

/** Rounds per block and iterations of the steady get-cycle (spec 7.1, 6.2, 10.1). */
export function plan(quick: boolean, shape: Shape) {
  return {
    warmup: quick ? 3 : 10,
    measured: quick ? 10 : ROUNDS[shape],
  };
}
const steadyPlan = (quick: boolean) =>
  quick ? { warmup: 10, measured: 200 } : { warmup: 100, measured: 1000 };

const WORKER = join(import.meta.dirname, 'worker.mjs');

/** Builds and verifies every cell, then samples: blocks in SHAPES order, then the steady get-cycle. */
export async function runScaleTimings(
  opts: ScaleRunOptions,
): Promise<{ raw: ScaleRaw; graphs: ScaleTimingsFile['graphs'] }> {
  const libraries = selectLibraries(opts.only, 'nexusdi');
  const shapes = SHAPES.filter((s) => (opts.shapes ?? SHAPES).includes(s));
  const sizes = SIZES.filter((n) => (opts.sizes ?? SIZES).includes(n));
  const graphs = shapes.flatMap((shape) =>
    sizes.map((size) => graphOf(shape, size)),
  );
  const raw: ScaleRaw = { blocks: [], steady: [] };
  await withConsumer(libraries, async (dir) => {
    const jobs = libraries
      .flatMap((lib) =>
        graphs.map((graph) => ({
          lib,
          variant: documentedVariant(lib),
          graph,
        })),
      )
      .sort((a, b) => b.graph.size - a.graph.size);
    const results = await pool(jobs, async ({ lib, variant, graph }) => {
      const r = await scaleCell(dir, lib, variant, graph);
      console.log(
        `  ${lib.id} ${variant} ${graph.shape} ${graph.size}: ${r.outcome}`,
      );
      return { lib, variant, graph, r };
    });
    const bad = results.filter(
      (x) => x.r.outcome !== 'pass' && x.r.outcome !== 'not-applicable',
    );
    if (bad.length > 0)
      throw new Error(
        `cells that do not pass, so nothing was sampled:\n${bad
          .map(
            (x) =>
              `  ${x.lib.id}/${x.variant} ${x.graph.shape} ${x.graph.size}: ${x.r.outcome}${x.r.message === undefined ? '' : ` (${x.r.message})`}`,
          )
          .join('\n')}`,
      );
    const ran = (
      x: (typeof results)[number],
    ): x is typeof x & {
      r: CellResult & { bundle: string; cellDir: string };
    } =>
      x.r.outcome === 'pass' &&
      x.r.bundle !== undefined &&
      x.r.cellDir !== undefined;
    const order = (a: (typeof results)[number], b: (typeof results)[number]) =>
      a.lib.id.localeCompare(b.lib.id) || a.graph.size - b.graph.size;

    for (const shape of shapes) {
      const here = results.filter((x) => x.graph.shape === shape).sort(order);
      const live = here.filter(ran);
      const { warmup, measured } = plan(opts.quick, shape);
      console.log(
        `Block ${shape}: ${live.length} cells, ${warmup}+${measured} rounds`,
      );
      const rows = await freshBlock(
        live.map((x) => ({
          library: x.lib.id,
          size: x.graph.size,
          bundle: x.r.bundle,
          graph: join(x.r.cellDir, 'graph.json'),
          packagesFile: join(x.r.cellDir, 'packages.mjs'),
        })),
        { block: shape, warmup, measured, seed: opts.seed },
      );
      raw.blocks.push({
        shape,
        warmup,
        measured,
        cells: here.map((x) => {
          const row = rows[live.findIndex((l) => l === x)];
          return {
            ...(row ?? {
              library: x.lib.id,
              size: x.graph.size,
              load: [],
              create: [],
              firstGet: [],
              rest: [],
              heapReady: [],
              firstResolve: [],
              ready: [],
              startup: [],
              warmup: [],
            }),
            library: x.lib.id,
            variant: x.variant,
            outcome: x.r.outcome,
          };
        }),
      });
    }

    if (shapes.includes('mixed')) {
      const { warmup, measured } = steadyPlan(opts.quick);
      for (const size of sizes) {
        const live = results
          .filter((x) => x.graph.shape === 'mixed' && x.graph.size === size)
          .sort(order)
          .filter(ran);
        const workers = new Map<
          string,
          { w: Worker; x: (typeof live)[number] }
        >(
          live.map((x) => {
            const id = `${x.lib.id}/${x.variant}@${size}`;
            return [id, { w: forkWorker(id, WORKER, [x.r.bundle]), x }];
          }),
        );
        try {
          console.log(`Steady get-cycle at ${size}`);
          const samples = await interleave(
            [...workers.values()].map((v) => v.w),
            'get-cycle',
            { warmup, measured, seed: opts.seed, sharedBatch: true },
          );
          for (const [id, { x }] of workers) {
            const s = samples[id];
            if (s === undefined) continue;
            raw.steady.push({
              library: x.lib.id,
              variant: x.variant,
              size,
              batch: s.batch,
              warmup: s.warmup,
              measured: s.measured,
            });
          }
        } finally {
          for (const { w } of workers.values()) w.close();
        }
      }
    }
  });
  return { raw, graphs: graphs.map(describeGraph) };
}

if (import.meta.main) {
  const quick = process.argv.includes('--quick');
  const only = onlyArg();
  const sizes = sizesArg();
  const shapes = shapesArg();
  const seed = seedArg();
  const where =
    quick || only !== undefined || sizes !== undefined || shapes !== undefined
      ? 'tmp'
      : 'results';
  const startedAt = new Date().toISOString();
  const { raw, graphs } = await runScaleTimings({
    only,
    sizes,
    shapes,
    quick,
    seed,
  });
  const rows = toScaleRows(raw, seed);
  checkFloor(
    rows
      .filter((r) => r.metric === 'get-cycle')
      .map((r) => ({ ...r, scenario: 'get-cycle' })),
  );
  const steady = steadyPlan(quick);
  const sha = gitSha();
  const file: ScaleTimingsFile = {
    schema: 1,
    sha,
    startedAt,
    versions: versionsOf(),
    runner: runnerInfo(),
    seed,
    graphSeed: GRAPH_SEED,
    coreRef: {
      ref: argValue('core-ref') ?? readCoreRef() ?? 'workspace',
      tree: coreTree(),
    },
    graphs: graphs.map(({ shape, size, hash }) => ({ shape, size, hash })),
    design: {
      'fresh-process': Object.fromEntries(
        raw.blocks.map((b) => [b.shape, design(b.warmup, b.measured)]),
      ),
      'steady-get': design(steady.warmup, steady.measured),
    },
    results: rows,
    growth: toScaleGrowth(raw, seed),
    marginal: toScaleMarginal(raw),
  };
  validate('scale-timings', file, where);
  const name = `${startedAt.slice(0, 10)}-${sha}`;
  mkdirSync(join(BENCHMARKS, where, 'scale'), { recursive: true });
  mkdirSync(join(BENCHMARKS, where, 'raw'), { recursive: true });
  const out = join(BENCHMARKS, where, 'scale', `${name}.json`);
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
  // Every round: each fresh-process cell keeps its warm-up samples in
  // `warmup` beside the measured rounds, and each steady entry keeps its own,
  // so a rerun of the statistics reproduces each interval (scale spec 8.3).
  writeFileSync(
    join(BENCHMARKS, where, 'raw', `scale-${name}.json.gz`),
    gzipSync(
      JSON.stringify({
        seed,
        graphSeed: GRAPH_SEED,
        coreRef: file.coreRef,
        tslib: tslibVersion(),
        ...raw,
      }),
    ),
  );
  console.log(`Wrote ${out}`);
}
