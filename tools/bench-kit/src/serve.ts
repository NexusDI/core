import { getHeapStatistics } from 'node:v8';

export interface Operation {
  setup?(): unknown;
  run(state: unknown): unknown;
  /** Run gc() before each batch, outside the timed region. */
  gc?: boolean;
  /** Releases what one `run` returned, after the timer stops. */
  teardown?(result: unknown, state: unknown): unknown;
}

type Message = {
  type: 'calibrate' | 'sample' | 'heap';
  op: string;
  /** A batch size the orchestrator fixed. It overrides this worker's calibration. */
  batch?: number;
};

const gc = (globalThis as { gc?: () => void }).gc;

async function timeBatch(op: Operation, state: unknown, batch: number) {
  const results: unknown[] | undefined =
    op.teardown === undefined ? undefined : new Array(batch);
  if (op.gc === true) gc?.();
  let sink: unknown;
  const start = process.hrtime.bigint();
  for (let i = 0; i < batch; i++) {
    const r = op.run(state);
    sink = r instanceof Promise ? await r : r;
    if (results !== undefined) results[i] = sink;
  }
  const ns = Number(process.hrtime.bigint() - start);
  return { ns, sink, results };
}

async function release(
  op: Operation,
  state: unknown,
  results: unknown[] | undefined,
) {
  if (results !== undefined)
    for (const r of results) await op.teardown?.(r, state);
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
        // A cold first call can take over 1 ms alone and fix the batch at 1,
        // so the operation runs for up to 20 ms (100 calls) before the
        // doubling starts.
        for (let spent = 0, i = 0; i < 100 && spent < 20_000_000; i++) {
          const t = await timeBatch(op, state, 1);
          await release(op, state, t.results);
          spent += t.ns;
        }
        let batch = 1;
        for (;;) {
          const t = await timeBatch(op, state, batch);
          await release(op, state, t.results);
          if (t.ns >= 1_000_000) break;
          batch *= 2;
        }
        batches.set(m.op, batch);
        process.send?.({ type: 'calibrated', op: m.op, batch });
        return;
      }
      const batch = m.batch ?? batches.get(m.op) ?? 1;
      if (m.type === 'heap') {
        // One batch between two reads of the used heap, after gc(), so the
        // difference is what the batch left allocated.
        gc?.();
        const before = getHeapStatistics().used_heap_size;
        const { sink, results } = await timeBatch(
          { ...op, gc: false },
          state,
          batch,
        );
        const bytes = (getHeapStatistics().used_heap_size - before) / batch;
        await release(op, state, results);
        process.send?.({ type: 'heap', op: m.op, bytes, sink: typeof sink });
        return;
      }
      const { ns, sink, results } = await timeBatch(op, state, batch);
      await release(op, state, results);
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
