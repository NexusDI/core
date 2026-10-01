import { fork, type ChildProcess } from 'node:child_process';

import { orderFor } from './order.ts';

export interface Worker {
  readonly id: string;
  calibrate(op: string): Promise<number>;
  /**
   * One batch of `op`, at `batch` when given, else at the calibrated size.
   * `timerStoppedAt`/`teardownStartedAt` are hrtime instants present only
   * when `op` has a teardown; comparing them proves teardown ran after
   * timing stopped without comparing elapsed durations.
   */
  sample(
    op: string,
    batch?: number,
  ): Promise<{
    ns: number;
    batch: number;
    timerStoppedAt?: bigint;
    teardownStartedAt?: bigint;
  }>;
  /** Heap bytes one operation leaves allocated, over one batch after gc(). */
  heap(op: string): Promise<number>;
  close(): void;
}

type Reply = { op: string } & (
  | { type: 'calibrated'; batch: number }
  | {
      type: 'sample';
      ns: number;
      batch: number;
      timerStoppedAt?: string;
      teardownStartedAt?: string;
    }
  | { type: 'heap'; bytes: number }
  | { type: 'error'; message: string }
);

const REPLY_TO = {
  calibrate: 'calibrated',
  sample: 'sample',
  heap: 'heap',
} as const;

type Request = { type: keyof typeof REPLY_TO; op: string; batch?: number };

/**
 * Sends one request and waits for its reply. A message whose operation or
 * type does not answer the request fails the call, so a stray message cannot
 * shift every later reply by one.
 */
function ask(child: ChildProcess, message: Request): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const settle = () => {
      child.off('exit', onExit);
      child.off('message', onMessage);
    };
    const onExit = (code: number | null) => {
      settle();
      reject(new Error(`exited with code ${code}`));
    };
    const onMessage = (reply: Reply) => {
      settle();
      if (
        reply.op !== message.op ||
        (reply.type !== REPLY_TO[message.type] && reply.type !== 'error')
      )
        reject(
          new Error(
            `expected ${REPLY_TO[message.type]} for ${message.op}, got ${reply.type} for ${reply.op}`,
          ),
        );
      else resolve(reply);
    };
    child.once('exit', onExit);
    child.on('message', onMessage);
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
  const call = async (message: Request) => {
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
    async sample(op, batch) {
      const r = await call({ type: 'sample', op, batch });
      if (r.type !== 'sample') throw new Error(`unexpected reply ${r.type}`);
      return {
        ns: r.ns / r.batch,
        batch: r.batch,
        timerStoppedAt:
          r.timerStoppedAt === undefined ? undefined : BigInt(r.timerStoppedAt),
        teardownStartedAt:
          r.teardownStartedAt === undefined
            ? undefined
            : BigInt(r.teardownStartedAt),
      };
    },
    async heap(op) {
      const r = await call({ type: 'heap', op });
      if (r.type !== 'heap') throw new Error(`unexpected reply ${r.type}`);
      return r.bytes;
    },
    close: () => void child.kill(),
  };
}

/**
 * One round asks every worker for one sample, in that round's Williams order.
 * With `sharedBatch`, every worker runs the largest batch any of them
 * calibrated, so the workers of a paired comparison amortise per-batch costs
 * (the gc() before each batch, the first call after it) over the same count.
 */
export async function interleave(
  workers: readonly Worker[],
  op: string,
  opts: {
    warmup: number;
    measured: number;
    seed: number;
    sharedBatch?: boolean;
  },
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
  const shared =
    opts.sharedBatch === true
      ? Math.max(...workers.map((w) => out[w.id].batch))
      : undefined;
  if (shared !== undefined) for (const w of workers) out[w.id].batch = shared;
  const rounds = opts.warmup + opts.measured;
  for (let round = 0; round < rounds; round++) {
    // The measured rounds start again at the first row, which keeps the
    // warm-up count out of their balance. The balance is exact when the
    // measured count is a multiple of the row count.
    const row = round < opts.warmup ? round : round - opts.warmup;
    for (const index of orderFor(row, workers.length, opts.seed)) {
      const w = workers[index];
      let ns: number;
      try {
        ({ ns } = await w.sample(op, shared));
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
