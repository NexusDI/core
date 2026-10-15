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
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

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
  type BlockRunner,
  type Design,
  type LibraryId,
  type Outcome,
  type ScaleCell,
  type PrefixWidth,
  type ProtocolCheck,
  type ScaleBlockInfo,
  type ScaleFile,
  type ScaleGrowth,
  type ScaleMarginal,
  type ScaleMetric,
  type ScaleTimingRow,
  type Variant,
  SCALE_RATIO_METRICS,
} from '../schema.ts';
import { firstLine } from '../text.ts';
import { checkFloor } from '../timings/floor.ts';
import { pool, scaleCell, type CellResult } from './cells.ts';
import { documentedVariant } from './deterministic.ts';
import {
  GRAPH_SEED,
  HEAP_ROUNDS,
  HEAP_ROUNDS_QUICK,
  PER_PROVIDER,
  ROUNDS,
  SHAPES,
  SIZES,
  TIMING_MODE,
  WIDTH_PREFIXES,
  type Shape,
} from './config.ts';
import { freshBlock, type FreshMode, type FreshRow } from './fresh.ts';
import { describeGraph } from './graph.ts';
import { localExponent, marginalPerProvider } from './growth.ts';
import {
  bundleSha256,
  mergeParts,
  type BundleHash,
  type ScalePart,
} from './merge.ts';
import { prefixWidths, protocolCheck } from './protocol.ts';
import { graphOf } from './shapes.ts';

/** One cell of a fresh-process block: its rounds, and whether it ran. */
export interface RawScaleCell extends Omit<FreshRow, 'library'> {
  library: LibraryId;
  variant: Variant;
  /** Only a `pass` has rounds; a not-applicable cell has none and yields no rows. */
  outcome: Outcome;
}

/** The serial heap block of a shape: the child in heap mode, 3 warm-up and 30 measured rounds. */
export interface RawHeapBlock {
  warmup: number;
  measured: number;
  cells: RawScaleCell[];
}

export interface RawBlock {
  shape: Shape;
  warmup: number;
  measured: number;
  cells: RawScaleCell[];
  /** Where heap-ready comes from; absent in a run that skips the heap block. */
  heap?: RawHeapBlock;
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
    /** Bootstrap block size; the default follows the round count. */
    block?: number,
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
      row.vsNexus = pairedRatio(reference, samples, seed, undefined, block);
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
  // heap-ready comes from the heap block, whose bootstrap block size is 4.
  for (const block of raw.blocks) {
    const passing = (block.heap?.cells ?? []).filter(
      (c) => c.outcome === 'pass',
    );
    for (const c of passing) {
      const nexus = passing.find((n) => isReference(n) && n.size === c.size);
      push(
        'heap-ready',
        'bytes',
        c,
        block.shape,
        c.size,
        1,
        c.heapReady,
        nexus?.heapReady,
        HEAP_BLOCK_SIZE,
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

const ALL_SIZES: readonly number[] = SIZES;

/** Bootstrap block size of the heap block's paired ratios (scale spec 7.1). */
export const HEAP_BLOCK_SIZE = 4;

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
          // Neighbours in SIZES only: no pair spans a size that failed.
          if (ALL_SIZES.indexOf(hi.size) !== ALL_SIZES.indexOf(lo.size) + 1)
            continue;
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
  const between = (
    metric: ScaleMarginal['metric'],
    shape: Shape,
    cells: readonly RawScaleCell[],
    field: 'startup' | 'heapReady',
  ) => {
    for (const lo of cells.filter(
      (c) => c.outcome === 'pass' && c.size === PER_PROVIDER.from,
    )) {
      const hi = cells.find(
        (c) =>
          c.outcome === 'pass' &&
          c.size === PER_PROVIDER.to &&
          c.library === lo.library &&
          c.variant === lo.variant,
      );
      if (hi === undefined) continue;
      out.push({
        metric,
        library: lo.library,
        variant: lo.variant,
        shape,
        perProvider: marginalPerProvider(lo[field], hi[field]),
      });
    }
  };
  for (const block of raw.blocks) {
    between('startup', block.shape, block.cells, 'startup');
    between('heap-ready', block.shape, block.heap?.cells ?? [], 'heapReady');
  }
  return out;
}

/**
 * The git tree SHA of the libs/core in `root`'s working tree, which is what
 * release-core.ts leaves checked out (it restores the worktree, not HEAD).
 * Hashes HEAD plus the working tree's changes through a throwaway index, so
 * the real index and the working tree stay as they are.
 */
export function coreTree(root = ROOT): string {
  const scratch = mkdtempSync(join(tmpdir(), 'core-tree-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') };
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  try {
    // Start from HEAD, so a tracked file that .gitignore covers stays in
    // the tree, then take the working tree's changes and deletions.
    git('read-tree', 'HEAD');
    git('add', '-A', '--', 'libs/core');
    return git('write-tree', '--prefix=libs/core/');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** What one attempted cell came to. */
export type CellVerdict = ScaleCell;

const cellName = (
  c: Pick<CellVerdict, 'library' | 'variant' | 'shape' | 'size'>,
) => `${c.library}/${c.variant} ${c.shape} ${c.size}`;
const sameCell = (a: CellVerdict, b: CellVerdict) =>
  cellName(a) === cellName(b);

/**
 * Decides which attempted cells stop the run, and returns every cell in the
 * order given. A competitor cell that fails to run (`runtime-error` or
 * `compile-error`) at a larger size is a scaling result when the same
 * library, variant and shape passes at n = 50, whether this run or the
 * committed `scale.json` says so: it is skipped and recorded (scale spec 14).
 * Everything else stops the run before sampling, because it is a harness
 * fault or a result that cannot be trusted:
 *
 * - a NexusDI plain cell that does not pass at any size;
 * - a competitor that fails at n = 50, or whose failure is not a
 *   runtime-error or compile-error (an equivalence fault: wrong-instance);
 * - a competitor failure with no pass at n = 50 on record;
 * - an outcome that contradicts `scale.json` at a size both cover.
 *
 * A cell that fails while it is sampled stops the run in `freshBlock`
 * (spec 7.3).
 */
export function judgeCells(
  attempted: readonly CellVerdict[],
  committed: readonly CellVerdict[],
): { cells: CellVerdict[]; abort?: string } {
  const stops: string[] = [];
  const line = (c: CellVerdict, why = '') =>
    `  ${cellName(c)}: ${c.outcome}${c.message === undefined ? '' : ` (${firstLine(c.message)})`}${why}`;
  const passesAt50 = (c: CellVerdict) =>
    [...attempted, ...committed].some(
      (o) =>
        o.outcome === 'pass' &&
        o.size === 50 &&
        o.library === c.library &&
        o.variant === c.variant &&
        o.shape === c.shape,
    );
  for (const c of attempted) {
    const before = committed.find((o) => sameCell(o, c));
    if (before !== undefined && before.outcome !== c.outcome) {
      stops.push(line(c, `; scale.json records ${before.outcome}`));
      continue;
    }
    if (c.outcome === 'pass' || c.outcome === 'not-applicable') continue;
    if (c.library === 'nexusdi' && c.variant === 'plain') {
      stops.push(line(c, '; the reference must run'));
      continue;
    }
    const scaling =
      (c.outcome === 'runtime-error' || c.outcome === 'compile-error') &&
      c.size !== 50 &&
      passesAt50(c);
    if (!scaling) stops.push(line(c));
  }
  return {
    cells: [...attempted],
    ...(stops.length === 0
      ? {}
      : {
          abort: `cells that stop the run, so nothing was sampled:\n${stops.join('\n')}`,
        }),
  };
}

/** The cells results/scale.json records, or none when the file is absent. */
function committedCells(): CellVerdict[] {
  const file = join(BENCHMARKS, 'results', 'scale.json');
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as ScaleFile).cells
    : [];
}

/**
 * The core ref a run records: `--core-ref`, else the file release-core.ts
 * wrote. A ref counts only when its libs/core tree is the tree packed, so a
 * stale file records `workspace`, and a wrong `--core-ref` fails the run
 * (a false explicit claim must not reach a results file).
 */
export function coreRefOf(
  from: { explicit?: string; fromFile?: string },
  root = ROOT,
): { ref: string; tree: string } {
  const tree = coreTree(root);
  const treeOf = (ref: string): string | undefined => {
    try {
      return execFileSync('git', ['rev-parse', `${ref}:libs/core`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return undefined;
    }
  };
  if (from.explicit !== undefined) {
    if (treeOf(from.explicit) !== tree)
      throw new Error(
        `--core-ref ${from.explicit} is not the libs/core that was packed (tree ${tree})`,
      );
    return { ref: from.explicit, tree };
  }
  if (from.fromFile !== undefined && treeOf(from.fromFile) === tree)
    return { ref: from.fromFile, tree };
  return { ref: 'workspace', tree };
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
  /** The shapes to time; every shape when absent. */
  shapes?: readonly Shape[];
  /** A job times one shape or the steady part; absent, one process times them all. */
  part?: Shape | 'steady';
  quick: boolean;
  seed: number;
  /** Run the protocol check on `mixed` (spec 7.4): the first dispatch run only. */
  protocolCheck?: boolean;
}

/** Rounds per timing block (spec 7.1): 10 warm-up and `ROUNDS`, or 3 and 10 under `--quick`. */
export function plan(quick: boolean, shape: Shape) {
  return {
    warmup: quick ? 3 : 10,
    measured: quick ? 10 : ROUNDS[shape],
  };
}
const heapPlan = (quick: boolean) => (quick ? HEAP_ROUNDS_QUICK : HEAP_ROUNDS);
const steadyPlan = (quick: boolean) =>
  quick ? { warmup: 10, measured: 200 } : { warmup: 100, measured: 1000 };

const WORKER = join(import.meta.dirname, 'worker.mjs');

/** The machine of a block: the runner, its image and kernel (the CPU can differ between jobs). */
export function blockRunner(): BlockRunner {
  return {
    ...runnerInfo(),
    ...(process.env.ImageOS === undefined
      ? {}
      : { imageOs: process.env.ImageOS }),
    ...(process.env.ImageVersion === undefined
      ? {}
      : { imageVersion: process.env.ImageVersion }),
    kernel: release(),
  };
}

/** What a part keeps beyond its file: every round of every block, warm-up included. */
export interface RawPart {
  part: Shape | 'steady';
  blocks: RawBlock[];
  steady: RawSteady[];
  /** The protocol-check block's rows, every spawn recorded (spec 7.4). */
  protocol?: Array<Omit<RawScaleCell, 'library'> & { library: LibraryId }>;
}

const emptyRow = (
  library: LibraryId,
  size: number,
  mode: FreshMode,
): Omit<FreshRow, 'library'> & { library: LibraryId } => ({
  library,
  size,
  mode,
  load: [],
  create: [],
  firstGet: [],
  rest: [],
  heapReady: [],
  firstResolve: [],
  ready: [],
  startup: [],
  warmup: [],
});

/**
 * Builds and verifies the cells of one part, then samples it: a shape's
 * timing block, serial heap block and, on request for `mixed`, the protocol
 * check, or the steady get-cycle of `mixed`. Every library and size of the
 * part runs on this machine.
 */
export async function runPart(
  opts: ScaleRunOptions & { part: Shape | 'steady' },
): Promise<{ part: ScalePart; raw: RawPart }> {
  const startedAt = new Date().toISOString();
  const libraries = selectLibraries(opts.only, 'nexusdi');
  const shape: Shape = opts.part === 'steady' ? 'mixed' : opts.part;
  const sizes = SIZES.filter((n) => (opts.sizes ?? SIZES).includes(n));
  const graphs = sizes.map((size) => graphOf(shape, size));
  const raw: RawPart = { part: opts.part, blocks: [], steady: [] };
  const info: ScaleBlockInfo[] = [];
  let verdicts: CellVerdict[] = [];
  let bundles: BundleHash[] = [];
  let prefix: PrefixWidth[] = [];
  let protocol: ProtocolCheck | undefined;
  let freshDesign: ScalePart['design']['fresh-process'];
  const log = (line: string) => console.log(line);

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
      log(`  ${lib.id} ${variant} ${graph.shape} ${graph.size}: ${r.outcome}`);
      return { lib, variant, graph, r };
    });
    const attempted: CellVerdict[] = results.map((x) => ({
      library: x.lib.id,
      variant: x.variant,
      shape: x.graph.shape,
      size: x.graph.size,
      outcome: x.r.outcome,
      ...(x.r.message === undefined ? {} : { message: x.r.message }),
    }));
    const judged = judgeCells(attempted, committedCells());
    if (judged.abort !== undefined) throw new Error(judged.abort);
    verdicts = judged.cells;
    type Result = (typeof results)[number];
    const ran = (
      x: Result,
    ): x is Result & { r: CellResult & { bundle: string; cellDir: string } } =>
      x.r.outcome === 'pass' &&
      x.r.bundle !== undefined &&
      x.r.cellDir !== undefined;
    const order = (a: Result, b: Result) =>
      a.lib.id.localeCompare(b.lib.id) || a.graph.size - b.graph.size;
    const live = results.slice().sort(order).filter(ran);
    if (shape === 'mixed')
      bundles = live.map((x) => ({
        library: x.lib.id,
        variant: x.variant,
        shape,
        size: x.graph.size,
        sha256: bundleSha256(readFileSync(x.r.bundle, 'utf8')),
      }));
    const fresh = (x: (typeof live)[number], mode: FreshMode) => ({
      library: x.lib.id,
      size: x.graph.size,
      bundle: x.r.bundle,
      graph: join(x.r.cellDir, 'graph.json'),
      packagesFile: join(x.r.cellDir, 'packages.mjs'),
      mode,
    });
    const rawCells = (
      rows: readonly FreshRow[],
      all: readonly Result[],
    ): RawScaleCell[] =>
      [...all].sort(order).map((x) => {
        const row = rows[live.findIndex((l) => l === x)];
        return {
          ...(row ?? emptyRow(x.lib.id, x.graph.size, 'timing')),
          library: x.lib.id,
          variant: x.variant,
          outcome: x.r.outcome,
        };
      });

    if (opts.part !== 'steady') {
      const t0 = Date.now();
      const { warmup, measured } = plan(opts.quick, shape);
      log(`Block ${shape}: ${live.length} cells, ${warmup}+${measured} rounds`);
      const timingRows = await freshBlock(
        live.map((x) => fresh(x, TIMING_MODE)),
        { block: shape, warmup, measured, seed: opts.seed, progress: log },
      );
      const heap = heapPlan(opts.quick);
      log(`Heap block ${shape}: ${heap.warmup}+${heap.measured} rounds`);
      const heapRows = await freshBlock(
        live.map((x) => fresh(x, 'heap')),
        {
          block: `${shape} heap`,
          warmup: heap.warmup,
          measured: heap.measured,
          seed: opts.seed,
          progress: log,
        },
      );
      raw.blocks.push({
        shape,
        warmup,
        measured,
        cells: rawCells(timingRows, [...results]),
        heap: {
          warmup: heap.warmup,
          measured: heap.measured,
          cells: rawCells(heapRows, [...results]),
        },
      });
      if (opts.protocolCheck === true && shape === 'mixed') {
        log(
          `Protocol check: ${heap.warmup}+${heap.measured} rounds, three modes`,
        );
        const modes: FreshMode[] = ['heap', 'timing', 'timing-no-gc'];
        const cells = live.flatMap((x) => modes.map((m) => fresh(x, m)));
        const rows = await freshBlock(cells, {
          block: 'mixed protocol',
          warmup: heap.warmup,
          measured: heap.measured,
          seed: opts.seed,
          progress: log,
        });
        const withVariant = rows.map((r, i) => ({
          ...r,
          library: r.library as LibraryId,
          variant: live[Math.floor(i / modes.length)]?.variant ?? 'plain',
          outcome: 'pass' as Outcome,
        }));
        raw.protocol = withVariant;
        protocol = protocolCheck(withVariant, opts.seed);
      }
      const block = raw.blocks[0];
      if (block !== undefined) {
        const passing = (cells: readonly RawScaleCell[]) =>
          cells.filter((c) => c.outcome === 'pass');
        prefix = prefixWidths(
          shape,
          passing(block.cells),
          passing(block.heap?.cells ?? []),
          opts.seed,
          shape === 'mixed' ? WIDTH_PREFIXES.mixed : WIDTH_PREFIXES.secondary,
        );
      }
      freshDesign = {
        shape,
        design: {
          ...design(warmup, measured),
          heap: design(heap.warmup, heap.measured),
        },
      };
      info.push({
        block: shape,
        runner: blockRunner(),
        wallMs: Date.now() - t0,
      });
    } else {
      const t0 = Date.now();
      const { warmup, measured } = steadyPlan(opts.quick);
      for (const size of sizes) {
        const here = live.filter((x) => x.graph.size === size);
        const workers = new Map<
          string,
          { w: Worker; x: (typeof live)[number] }
        >(
          here.map((x) => {
            const id = `${x.lib.id}/${x.variant}@${size}`;
            return [id, { w: forkWorker(id, WORKER, [x.r.bundle]), x }];
          }),
        );
        try {
          log(`Steady get-cycle at ${size}`);
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
      bundles = live.map((x) => ({
        library: x.lib.id,
        variant: x.variant,
        shape,
        size: x.graph.size,
        sha256: bundleSha256(readFileSync(x.r.bundle, 'utf8')),
      }));
      info.push({
        block: 'steady-get',
        runner: blockRunner(),
        wallMs: Date.now() - t0,
      });
    }
  });

  const rows = toScaleRows(
    { blocks: raw.blocks, steady: raw.steady },
    opts.seed,
  );
  const steady = steadyPlan(opts.quick);
  const part: ScalePart = {
    part: opts.part,
    sha: gitSha(),
    startedAt,
    versions: versionsOf(),
    seed: opts.seed,
    graphSeed: GRAPH_SEED,
    scaleSha256: scaleSha256(),
    timingMode: TIMING_MODE,
    coreRef: coreRefOf({
      explicit: argValue('core-ref'),
      fromFile: readCoreRef(),
    }),
    graphs: graphs.map(describeGraph).map(({ shape: s, size, hash }) => ({
      shape: s,
      size,
      hash,
    })),
    cells: verdicts,
    blocks: info,
    design: {
      ...(freshDesign === undefined ? {} : { 'fresh-process': freshDesign }),
      ...(opts.part === 'steady'
        ? { 'steady-get': design(steady.warmup, steady.measured) }
        : {}),
    },
    results: rows,
    growth: toScaleGrowth({ blocks: raw.blocks, steady: [] }, opts.seed),
    marginal: toScaleMarginal({ blocks: raw.blocks, steady: [] }),
    ...(prefix.length > 0 ? { prefixWidths: prefix } : {}),
    ...(protocol === undefined ? {} : { protocolCheck: protocol }),
    bundles,
  };
  return { part, raw };
}

/** The SHA-256 of results/scale.json, which every part validates against. */
function scaleSha256(): string {
  return createHash('sha256')
    .update(readFileSync(join(BENCHMARKS, 'results', 'scale.json')))
    .digest('hex');
}

/** The committed scale.json, for the merge's hash check. */
function committedScale(): ScaleFile {
  return JSON.parse(
    readFileSync(join(BENCHMARKS, 'results', 'scale.json'), 'utf8'),
  ) as ScaleFile;
}

const gz = (value: unknown) => gzipSync(JSON.stringify(value));

if (import.meta.main) {
  const quick = process.argv.includes('--quick');
  const only = onlyArg();
  const sizes = sizesArg();
  const shapes = shapesArg();
  const seed = seedArg();
  const mergeMode = process.argv.includes('--merge');
  const partName = argValue('part') as Shape | 'steady' | undefined;
  const protocol = process.argv.includes('--protocol-check');
  const partial =
    quick || only !== undefined || sizes !== undefined || shapes !== undefined;
  const where = partial ? 'tmp' : 'results';
  const partsDir = join(BENCHMARKS, where, 'scale-parts');
  const base = { only, sizes, quick, seed, protocolCheck: protocol };

  if (partName !== undefined) {
    // One job: its part and raw samples, merged later (spec 10.2).
    if (
      partName !== 'steady' &&
      !(SHAPES as readonly string[]).includes(partName)
    )
      throw new Error(`--part=${partName} is not a shape or steady`);
    const { part, raw } = await runPart({ ...base, part: partName });
    mkdirSync(partsDir, { recursive: true });
    writeFileSync(
      join(partsDir, `${partName}.json`),
      JSON.stringify(part, null, 2) + '\n',
    );
    writeFileSync(join(partsDir, `${partName}.raw.json.gz`), gz(raw));
    console.log(`Wrote ${join(partsDir, `${partName}.json`)}`);
  } else {
    const names: Array<Shape | 'steady'> = mergeMode
      ? readdirSync(partsDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length) as Shape | 'steady')
      : [
          ...SHAPES.filter((s) => (shapes ?? SHAPES).includes(s)),
          ...((shapes ?? SHAPES).includes('mixed')
            ? (['steady'] as const)
            : []),
        ];
    const parts: ScalePart[] = [];
    const raws: RawPart[] = [];
    for (const name of names) {
      if (mergeMode) {
        parts.push(
          JSON.parse(
            readFileSync(join(partsDir, `${name}.json`), 'utf8'),
          ) as ScalePart,
        );
        raws.push(
          JSON.parse(
            gunzipSync(
              readFileSync(join(partsDir, `${name}.raw.json.gz`)),
            ).toString(),
          ) as RawPart,
        );
      } else {
        const r = await runPart({ ...base, part: name });
        parts.push(r.part);
        raws.push(r.raw);
      }
    }
    const { file } = mergeParts(parts, {
      scale: committedScale(),
      scaleSha256: scaleSha256(),
      partial,
      steadyFallback: design(
        steadyPlan(quick).warmup,
        steadyPlan(quick).measured,
      ),
    });
    checkFloor(
      file.results
        .filter((r) => r.metric === 'get-cycle')
        .map((r) => ({ ...r, scenario: 'get-cycle' })),
    );
    validate('scale-timings', file, where);
    const name = `${file.startedAt.slice(0, 10)}-${file.sha}`;
    mkdirSync(join(BENCHMARKS, where, 'scale'), { recursive: true });
    mkdirSync(join(BENCHMARKS, where, 'raw'), { recursive: true });
    const out = join(BENCHMARKS, where, 'scale', `${name}.json`);
    writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
    // Every round, warm-up included, so a rerun of the statistics reproduces
    // each interval (scale spec 8.3).
    writeFileSync(
      join(BENCHMARKS, where, 'raw', `scale-${name}.json.gz`),
      gz({
        seed: file.seed,
        graphSeed: GRAPH_SEED,
        coreRef: file.coreRef,
        tslib: tslibVersion(),
        parts: raws,
      }),
    );
    console.log(`Wrote ${out}`);
  }
}
