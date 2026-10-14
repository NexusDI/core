/**
 * Cold start (spec 4.7): each round spawns one fresh Node process per
 * library, in the round's balanced order, and times from just before the
 * spawn to the child's ready message. The child reports its own
 * performance.now() too.
 */
import { join } from 'node:path';

import { orderFor } from '@nexusdi/bench-kit';

import { spawnChild } from './spawn.ts';

const CHILD = join(import.meta.dirname, 'cold-child.mjs');

export interface ColdFixture {
  library: string;
  variant: string;
  module: string;
}

export interface ColdRow {
  library: string;
  variant: string;
  /** Measured spawns only, in round order: spawn to ready, ns. */
  spawnNs: number[];
  /** The child's own performance.now() at ready, ms. */
  childMs: number[];
}

async function spawnOnce(module: string): Promise<{ ns: number; ms: number }> {
  const { ns, message } = await spawnChild<{ type: string; now: number }>(
    CHILD,
    [module],
    [],
    'ready',
  );
  return { ns, ms: message.now };
}

export async function coldStart(
  fixtures: readonly ColdFixture[],
  opts: { warmup: number; measured: number; seed: number },
): Promise<ColdRow[]> {
  const rows = fixtures.map((f) => ({
    library: f.library,
    variant: f.variant,
    spawnNs: [] as number[],
    childMs: [] as number[],
  }));
  const rounds = opts.warmup + opts.measured;
  for (let round = 0; round < rounds; round++)
    for (const i of orderFor(round, fixtures.length, opts.seed)) {
      const f = fixtures[i];
      const row = rows[i];
      if (f === undefined || row === undefined) continue;
      let r: { ns: number; ms: number };
      try {
        r = await spawnOnce(f.module);
      } catch (error) {
        throw new Error(
          `${f.library}/${f.variant} cold-start round ${round}: ${(error as Error).message}`,
        );
      }
      if (round < opts.warmup) continue;
      row.spawnNs.push(r.ns);
      row.childMs.push(r.ms);
    }
  return rows;
}
