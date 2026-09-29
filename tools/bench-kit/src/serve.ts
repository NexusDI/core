import { getHeapStatistics } from 'node:v8';

export interface Operation {
  setup?(): unknown;
  run(state: unknown): unknown;
  /** Run gc() before each batch, outside the timed region. */
  gc?: boolean;
}

type Message = { type: 'calibrate' | 'sample' | 'heap'; op: string };

const gc = (globalThis as { gc?: () => void }).gc;

async function timeBatch(op: Operation, state: unknown, batch: number) {
  if (op.gc === true) gc?.();
  let sink: unknown;
  const start = process.hrtime.bigint();
  for (let i = 0; i < batch; i++) {
    const r = op.run(state);
    sink = r instanceof Promise ? await r : r;
  }
  return { ns: Number(process.hrtime.bigint() - start), sink };
}

/** Serves samples to the orchestrator over the fork IPC channel. The timing runs here, so the round trip is outside it. */
export function serveSamples(ops: Record<string, Operation>): void {
  const batches = new Map<string, number>();
  const states = new Map<string, unknown>();
  process.on('message', async (m: Message) => {
    const op = ops[m.op];
    try {
      if (op === undefined) throw new Error(`unknown operation ${m.op}`);
      if (!states.has(m.op)) states.set(m.op, await op.setup?.());
      const state = states.get(m.op);
      if (m.type === 'calibrate') {
        let batch = 1;
        while ((await timeBatch(op, state, batch)).ns < 1_000_000) batch *= 2;
        batches.set(m.op, batch);
        process.send?.({ type: 'calibrated', op: m.op, batch });
        return;
      }
      const batch = batches.get(m.op) ?? 1;
      if (m.type === 'heap') {
        // One batch between two reads of the used heap, after gc(), so the
        // difference is what the batch left allocated.
        gc?.();
        const before = getHeapStatistics().used_heap_size;
        const { sink } = await timeBatch({ ...op, gc: false }, state, batch);
        const bytes = (getHeapStatistics().used_heap_size - before) / batch;
        process.send?.({ type: 'heap', op: m.op, bytes, sink: typeof sink });
        return;
      }
      const { ns, sink } = await timeBatch(op, state, batch);
      process.send?.({
        type: 'sample',
        op: m.op,
        ns,
        batch,
        sink: typeof sink,
      });
    } catch (error) {
      process.send?.({
        type: 'error',
        op: m.op,
        message: (error as Error).message,
      });
    }
  });
}
