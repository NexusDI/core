/**
 * The fresh-process block driver (scale spec 7.1). One block holds every
 * passing cell of one shape at all sizes. A round spawns one child per cell,
 * one at a time, in the round's `orderFor` row, and waits for each to exit.
 * Warm-up rounds run first and are dropped; the rest are the measured rounds.
 */
import { join } from 'node:path';

import { orderFor } from '@nexusdi/bench-kit';

import { spawnChild } from '../timings/spawn.ts';

const CHILD = join(import.meta.dirname, 'child.mjs');

export interface FreshCell {
  library: string;
  size: number;
  /** The cell's esbuild bundle, an absolute path. */
  bundle: string;
  /** The cell's graph as JSON, for the child's construction count. */
  graph: string;
  /** The cell's `packages.mjs`, written by bundleCell: imports the library packages untimed. */
  packagesFile: string;
  /** The child mode (scale spec 6.1); `timing` when absent. */
  mode?: FreshMode;
}

/** The child's modes: heap (settles, reads the heap), timing, and timing without the gc() before create. */
export type FreshMode = 'heap' | 'timing' | 'timing-no-gc';

/** What `child.mjs` sends: ns for the four phases, bytes for the heap. */
export interface FreshSample {
  load: number;
  create: number;
  firstGet: number;
  rest: number;
  /** Heap mode only. */
  heapReady?: number;
}

/** One cell's measured rounds, in round order, one array entry per round. */
export interface FreshRow {
  library: string;
  size: number;
  mode: FreshMode;
  load: number[];
  create: number[];
  firstGet: number[];
  rest: number[];
  /** Heap mode only: empty in the timing modes. */
  heapReady: number[];
  /** load + create + first-get. */
  firstResolve: number[];
  /** create + first-get + rest. */
  ready: number[];
  /** load + ready. */
  startup: number[];
  /** The warm-up rounds' samples, in round order, for the raw file. No metric reads them. */
  warmup: FreshSample[];
}

export interface FreshOptions {
  /** The shape, for error messages. */
  block: string;
  warmup: number;
  measured: number;
  seed: number;
  /** Called after every 50 rounds with one line, for a job log that shows a stall. */
  progress?: (line: string) => void;
  /** Replaces spawnChild, so a test can watch the spawn order. */
  spawn?: typeof spawnChild;
}

// Any NODE_* or UV_* variable (compile cache, options, thread pool size)
// would change what a fresh process costs.
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith('NODE_') || key.startsWith('UV_')) delete env[key];
  return env;
}

export async function freshBlock(
  cells: readonly FreshCell[],
  opts: FreshOptions,
): Promise<FreshRow[]> {
  const spawn = opts.spawn ?? spawnChild;
  const env = cleanEnv();
  const rows: FreshRow[] = cells.map((c) => ({
    library: c.library,
    size: c.size,
    mode: c.mode ?? 'timing',
    load: [],
    create: [],
    firstGet: [],
    rest: [],
    heapReady: [],
    firstResolve: [],
    ready: [],
    startup: [],
    warmup: [],
  }));
  const rounds = opts.warmup + opts.measured;
  for (let round = 0; round < rounds; round++) {
    for (const i of orderFor(round, cells.length, opts.seed)) {
      const cell = cells[i];
      const row = rows[i];
      if (cell === undefined || row === undefined) continue;
      let s: FreshSample;
      try {
        ({ message: s } = await spawn<FreshSample & { type: 'sample' }>(
          CHILD,
          [cell.bundle, cell.graph, cell.packagesFile, cell.mode ?? 'timing'],
          ['--expose-gc'],
          'sample',
          env,
        ));
      } catch (error) {
        throw new Error(
          `${cell.library}/${cell.size} fresh-process block ${opts.block} round ${round}: ${(error as Error).message}`,
        );
      }
      if (round < opts.warmup) {
        row.warmup.push(s);
        continue;
      }
      const ready = s.create + s.firstGet + s.rest;
      row.load.push(s.load);
      row.create.push(s.create);
      row.firstGet.push(s.firstGet);
      row.rest.push(s.rest);
      if (s.heapReady !== undefined) row.heapReady.push(s.heapReady);
      row.firstResolve.push(s.load + s.create + s.firstGet);
      row.ready.push(ready);
      row.startup.push(s.load + ready);
    }
    // After the last spawn of a round.
    if ((round + 1) % 50 === 0 && round + 1 < rounds)
      opts.progress?.(`${opts.block} block: ${round + 1} of ${rounds} rounds`);
  }
  return rows;
}
