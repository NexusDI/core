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
  /** Library packages to import untimed first, polyfill first. */
  packages: readonly string[];
}

/** What `child.mjs` sends: ns for the four phases, bytes for the heap. */
export interface FreshSample {
  load: number;
  create: number;
  firstGet: number;
  rest: number;
  heapReady: number;
}

/** One cell's measured rounds, in round order, one array entry per round. */
export interface FreshRow {
  library: string;
  size: number;
  load: number[];
  create: number[];
  firstGet: number[];
  rest: number[];
  heapReady: number[];
  /** load + create + first-get. */
  firstResolve: number[];
  /** create + first-get + rest. */
  ready: number[];
  /** load + ready. */
  startup: number[];
}

export interface FreshOptions {
  /** The shape, for error messages. */
  block: string;
  warmup: number;
  measured: number;
  seed: number;
  /** Replaces spawnChild, so a test can watch the spawn order. */
  spawn?: typeof spawnChild;
}

// A cached compile or injected flags would change what a fresh process costs.
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_COMPILE_CACHE;
  delete env.NODE_OPTIONS;
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
    load: [],
    create: [],
    firstGet: [],
    rest: [],
    heapReady: [],
    firstResolve: [],
    ready: [],
    startup: [],
  }));
  const rounds = opts.warmup + opts.measured;
  for (let round = 0; round < rounds; round++)
    for (const i of orderFor(round, cells.length, opts.seed)) {
      const cell = cells[i];
      const row = rows[i];
      if (cell === undefined || row === undefined) continue;
      let s: FreshSample;
      try {
        ({ message: s } = await spawn<FreshSample>(
          CHILD,
          [cell.bundle, cell.graph, ...cell.packages],
          ['--expose-gc'],
          env,
        ));
      } catch (error) {
        throw new Error(
          `${cell.library}/${cell.size} fresh-process block ${opts.block} round ${round}: ${(error as Error).message}`,
        );
      }
      if (round < opts.warmup) continue;
      const ready = s.create + s.firstGet + s.rest;
      row.load.push(s.load);
      row.create.push(s.create);
      row.firstGet.push(s.firstGet);
      row.rest.push(s.rest);
      row.heapReady.push(s.heapReady);
      row.firstResolve.push(s.load + s.create + s.firstGet);
      row.ready.push(ready);
      row.startup.push(s.load + ready);
    }
  return rows;
}
