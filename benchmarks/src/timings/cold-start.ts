/**
 * Cold start (spec 4.7): each round spawns one fresh Node process per
 * library, in the round's balanced order, and times from just before the
 * spawn to the child's ready message. The child reports its own
 * performance.now() too.
 */
import { fork } from 'node:child_process';
import { join } from 'node:path';

import { orderFor } from '@nexusdi/bench-kit';

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

function spawnOnce(module: string): Promise<{ ns: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const child = fork(CHILD, [module], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    let ready: { ns: number; ms: number } | undefined;
    child.once('message', (m: { type: string; now: number }) => {
      if (m.type === 'ready')
        ready = { ns: Number(process.hrtime.bigint() - t0), ms: m.now };
    });
    // The next spawn waits for this process to exit.
    child.once('exit', (code) =>
      ready !== undefined
        ? resolve(ready)
        : reject(new Error(`exited with code ${code}: ${stderr.trim()}`)),
    );
  });
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
