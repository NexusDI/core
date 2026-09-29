import { fork, type ChildProcess } from 'node:child_process';

import { orderFor } from './order.ts';

export interface Worker {
  readonly id: string;
  calibrate(op: string): Promise<number>;
  sample(op: string): Promise<{ ns: number; batch: number }>;
  /** Heap bytes one operation leaves allocated, over one batch after gc(). */
  heap(op: string): Promise<number>;
  close(): void;
}

type Reply =
  | { type: 'calibrated'; batch: number }
  | { type: 'sample'; ns: number; batch: number }
  | { type: 'heap'; bytes: number }
  | { type: 'error'; message: string };

function ask(child: ChildProcess, message: object): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null) =>
      reject(new Error(`exited with code ${code}`));
    child.once('exit', onExit);
    child.once('message', (reply: Reply) => {
      child.off('exit', onExit);
      resolve(reply);
    });
    child.send(message);
  });
}

export function forkWorker(
  id: string,
  script: string,
  args: string[] = [],
  execArgv: string[] = ['--expose-gc'],
): Worker {
  const child = fork(script, args, {
    execArgv,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const call = async (message: { type: string; op: string }) => {
    const reply = await ask(child, message);
    if (reply.type === 'error') throw new Error(reply.message);
    return reply;
  };
  return {
    id,
    async calibrate(op) {
      const r = await call({ type: 'calibrate', op });
      return r.type === 'calibrated' ? r.batch : 1;
    },
    async sample(op) {
      const r = await call({ type: 'sample', op });
      if (r.type !== 'sample') throw new Error(`unexpected reply ${r.type}`);
      return { ns: r.ns / r.batch, batch: r.batch };
    },
    async heap(op) {
      const r = await call({ type: 'heap', op });
      if (r.type !== 'heap') throw new Error(`unexpected reply ${r.type}`);
      return r.bytes;
    },
    close: () => void child.kill(),
  };
}

/** One round asks every worker for one sample, in that round's Williams order. */
export async function interleave(
  workers: readonly Worker[],
  op: string,
  opts: { warmup: number; measured: number; seed: number },
): Promise<
  Record<string, { batch: number; warmup: number[]; measured: number[] }>
> {
  const out: Record<
    string,
    { batch: number; warmup: number[]; measured: number[] }
  > = {};
  for (const w of workers) {
    let batch: number;
    try {
      batch = await w.calibrate(op);
    } catch (error) {
      throw new Error(`${w.id} ${op} calibration: ${(error as Error).message}`);
    }
    out[w.id] = { batch, warmup: [], measured: [] };
  }
  const rounds = opts.warmup + opts.measured;
  for (let round = 0; round < rounds; round++) {
    for (const index of orderFor(round, workers.length, opts.seed)) {
      const w = workers[index];
      let ns: number;
      try {
        ({ ns } = await w.sample(op));
      } catch (error) {
        throw new Error(
          `${w.id} ${op} round ${round}: ${(error as Error).message}`,
        );
      }
      (round < opts.warmup ? out[w.id].warmup : out[w.id].measured).push(ns);
    }
  }
  return out;
}
