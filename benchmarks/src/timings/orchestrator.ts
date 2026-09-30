/**
 * The in-process timings of spec 4.7: one long-lived worker per
 * library-variant, every scenario sampled across all workers in balanced
 * interleaved rounds, and each competitor paired with NexusDI's documented
 * variant round by round.
 *
 *   node src/timings/orchestrator.ts             writes results/timings/<date>-<sha7>.json
 *   node src/timings/orchestrator.ts --quick     10 warm-up, 50 measured, under tmp/
 *   node src/timings/orchestrator.ts --only=a,b  those libraries and NexusDI, under tmp/
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
import { compile } from '@nexusdi/toolchain-matrix/recipes';

import { gitSha, runnerInfo } from '../build.ts';
import { prepareConsumer } from '../consumer.ts';
import { BENCHMARKS, configsFor, type Library } from '../libraries.ts';
import { versionsOf } from '../matrix.ts';
import {
  validate,
  type Design,
  type LibraryId,
  type MatrixFile,
  type Scenario,
  type TimingRow,
  type TimingsFile,
  type Variant,
} from '../schema.ts';
import { coldStart } from './cold-start.ts';
import { checkFloor } from './floor.ts';
import {
  fixtureCell,
  onlyArg,
  readMatrix,
  seedArg,
  selectLibraries,
  variantsOf,
} from '../cli.ts';

type Lifetime = 'singleton' | 'transient' | 'scoped';

export interface TimingFixture {
  library: string;
  variant: string;
  /** Absolute path of the compiled fixture. */
  module: string;
  /** The scenarios this library-variant passes in the matrix. */
  scenarios: readonly Scenario[];
}

/** The worker scenarios, and the matrix section each one needs. */
export const WORKER_SCENARIOS: ReadonlyArray<[Scenario, Lifetime]> = [
  ['ready', 'singleton'],
  ['resolve-singleton', 'singleton'],
  ['resolve-transient', 'transient'],
  ['scope-cycle', 'scoped'],
];

export interface Sampled {
  batch: number;
  warmup: number[];
  measured: number[];
}

/** One row per library-variant and scenario, without the paired ratio yet. */
export interface RawRow {
  scenario: Scenario;
  library: string;
  variant: string;
  batch: number;
  samples: Sampled;
  heapBytes?: number;
}

const WORKER = join(import.meta.dirname, 'worker.mjs');

export async function runTimings(opts: {
  fixtures: readonly TimingFixture[];
  quick: boolean;
  seed: number;
}): Promise<RawRow[]> {
  const warmup = opts.quick ? 10 : 100;
  const measured = opts.quick ? 50 : 1000;
  const workers = new Map<TimingFixture, Worker>(
    opts.fixtures.map((f) => [
      f,
      forkWorker(`${f.library}/${f.variant}`, WORKER, [f.module]),
    ]),
  );
  const rows: RawRow[] = [];
  try {
    for (const [scenario] of WORKER_SCENARIOS) {
      const taking = opts.fixtures.filter((f) =>
        f.scenarios.includes(scenario),
      );
      if (taking.length === 0) continue;
      const pool = taking.map((f) => workers.get(f) as Worker);
      const samples = await interleave(pool, scenario, {
        warmup,
        measured,
        seed: opts.seed,
      });
      for (const f of taking) {
        const worker = workers.get(f) as Worker;
        const s = samples[worker.id];
        if (s === undefined) continue;
        const row: RawRow = {
          scenario,
          library: f.library,
          variant: f.variant,
          batch: s.batch,
          samples: s,
        };
        if (scenario === 'ready') row.heapBytes = await worker.heap('ready');
        rows.push(row);
      }
    }
  } finally {
    for (const w of workers.values()) w.close();
  }
  return rows;
}

/**
 * Stats per row, and each competitor's ratio against NexusDI's documented
 * variant (`nexusVariant`, from libraries.json) in the same rounds.
 */
export function toTimingRows(
  raw: readonly RawRow[],
  seed: number,
  nexusVariant: string,
): TimingRow[] {
  return raw.map((r) => {
    const nexus = raw.find(
      (n) =>
        n.scenario === r.scenario &&
        n.library === 'nexusdi' &&
        n.variant === nexusVariant,
    );
    const row: TimingRow = {
      scenario: r.scenario,
      library: r.library as LibraryId,
      variant: r.variant as Variant,
      toolchain: 'tsc',
      batch: r.batch,
      stats: summarize(r.samples.measured),
    };
    if (r.heapBytes !== undefined) row.heapBytes = r.heapBytes;
    if (r.library !== 'nexusdi' && nexus !== undefined)
      row.vsNexus = pairedRatio(
        nexus.samples.measured,
        r.samples.measured,
        seed,
      );
    return row;
  });
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

/** The scenarios whose matrix section passes on tsc for this library-variant. */
function passing(
  matrix: MatrixFile,
  lib: Library,
  variant: Variant,
): Scenario[] {
  const cell = matrix.cells.find(
    (c) =>
      c.library === lib.id && c.variant === variant && c.toolchain === 'tsc',
  );
  if (cell === undefined) return [];
  return WORKER_SCENARIOS.filter(
    ([, section]) => cell.sections[section] === 'pass',
  ).map(([scenario]) => scenario);
}

if (import.meta.main) {
  const quick = process.argv.includes('--quick');
  const only = onlyArg();
  const seed = seedArg();
  const where = quick || only !== undefined ? 'tmp' : 'results';
  const startedAt = new Date().toISOString();

  const matrix = readMatrix();
  const libraries = selectLibraries(only, 'nexusdi');
  const dir = prepareConsumer({ libraries: libraries.map((l) => l.id) });
  try {
    const fixtures: Array<TimingFixture & { documented: boolean }> = [];
    for (const lib of libraries)
      for (const variant of variantsOf(lib)) {
        const { cellDir, profile } = fixtureCell(
          dir,
          `timings-${lib.id}-${variant}`,
          lib,
          variant,
        );
        const module = join(
          cellDir,
          compile('tsc', cellDir, 'src/main.ts', configsFor(profile, 'tsc')),
        );
        fixtures.push({
          library: lib.id,
          variant,
          module,
          scenarios: passing(matrix, lib, variant),
          documented: lib.variants[variant]?.documented === true,
        });
      }

    const coldWarmup = quick ? 2 : 20;
    const coldMeasured = quick ? 10 : 1000;
    // Cold start runs first, before the long-lived workers exist.
    const cold = await coldStart(
      fixtures.filter((f) => f.documented && f.scenarios.includes('ready')),
      { warmup: coldWarmup, measured: coldMeasured, seed },
    );
    const raw = await runTimings({ fixtures, quick, seed });
    const nexusVariant = fixtures.find(
      (f) => f.library === 'nexusdi' && f.documented,
    )?.variant;
    if (nexusVariant === undefined)
      throw new Error('libraries.json documents no NexusDI variant');
    const coldNexus = cold.find((c) => c.library === 'nexusdi');
    const rows: TimingRow[] = [
      ...cold.map((c) => {
        const row: TimingRow = {
          scenario: 'cold-start',
          library: c.library as LibraryId,
          variant: c.variant as Variant,
          toolchain: 'tsc',
          batch: 1,
          stats: summarize(c.spawnNs),
          childNow: summarize(c.childMs),
        };
        if (c.library !== 'nexusdi' && coldNexus !== undefined)
          row.vsNexus = pairedRatio(coldNexus.spawnNs, c.spawnNs, seed);
        return row;
      }),
      ...toTimingRows(raw, seed, nexusVariant),
    ];
    checkFloor(rows);

    const sha = gitSha();
    const file: TimingsFile = {
      schema: 1,
      sha,
      startedAt,
      versions: versionsOf(),
      runner: runnerInfo(),
      seed,
      design: {
        'cold-start': design(coldWarmup, coldMeasured),
        'in-process': design(quick ? 10 : 100, quick ? 50 : 1000),
      },
      results: rows,
    };
    validate('timings', file, where);
    const name = `${startedAt.slice(0, 10)}-${sha}`;
    mkdirSync(join(BENCHMARKS, where, 'timings'), { recursive: true });
    mkdirSync(join(BENCHMARKS, where, 'raw'), { recursive: true });
    const out = join(BENCHMARKS, where, 'timings', `${name}.json`);
    writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
    // Every sample, warm-up included, so a rerun of the statistics
    // reproduces each interval from the recorded seed.
    writeFileSync(
      join(BENCHMARKS, where, 'raw', `${name}.json.gz`),
      gzipSync(JSON.stringify({ seed, cold, raw })),
    );
    console.log(`Wrote ${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
