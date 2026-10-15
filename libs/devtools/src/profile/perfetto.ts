import { criticalPathOf } from './critical-path.js';
import type { ProfileReport, TraceFile } from './report.js';
import { stepsOf } from './steps.js';

type Event = Readonly<Record<string, unknown>>;

const us = (msValue: number): number => Math.round(msValue * 1000);

/**
 * The report as plain Trace Event Format for ui.perfetto.dev (spec 7.4):
 * one pid per run, tid 1 for the steps, one tid per built provider sorted
 * by level, and a flow arrow per edge with ordersBuild between two
 * providers the run built. Perfetto requires slices on a tid to nest, so
 * concurrent providers each get a tid.
 */
export function toPerfettoTrace(report: ProfileReport): TraceFile {
  const events: Event[] = [];
  let flow = 0;
  report.runs.forEach((run, index) => {
    const pid = index + 1;
    const meta = (name: string, tid: number, args: Event): void => {
      events.push({ name, ph: 'M', pid, tid, ts: 0, args });
    };
    // Both ends round on their own, so a child slice that ends inside its
    // parent in ms also ends inside it in µs, and the slices still nest.
    const slice = (
      name: string,
      tid: number,
      startMs: number,
      endMs: number,
      args?: Event,
    ): void => {
      events.push({
        name,
        ph: 'X',
        pid,
        tid,
        ts: us(startMs),
        dur: us(endMs) - us(startMs),
        ...(args === undefined ? {} : { args }),
      });
    };
    meta('process_name', 0, { name: `nexusdi ${run.kind} (run ${run.id})` });
    meta('thread_name', 1, { name: 'steps' });
    meta('thread_sort_index', 1, { sort_index: 0 });
    for (const s of run.steps.length > 0 ? run.steps : stepsOf(run))
      slice(s.step, 1, s.startMs, s.startMs + s.durationMs);

    const tids = new Map<string, number>();
    const order = new Map<number, number>();
    const builds = [...run.builds].sort(
      (a, b) => (a.level ?? -1) - (b.level ?? -1) || a.startMs - b.startMs,
    );
    for (const b of builds) {
      const tid = tids.size + 2;
      tids.set(b.providerId, tid);
      const level = b.level ?? 0;
      const n = (order.get(level) ?? 0) + 1;
      order.set(level, n);
      meta('thread_name', tid, { name: b.token });
      meta('thread_sort_index', tid, { sort_index: level * 10000 + n });
      const end = b.startMs + b.durationMs;
      slice(b.token, tid, b.startMs, end, {
        module: b.module,
        lifetime: b.lifetime,
        level: b.level,
        run: run.id,
        syncMs: b.syncMs,
        awaitMs: b.awaitMs,
        finishMs: b.finishMs,
        async: b.async,
        failed: b.failed,
      });
      if (b.syncMs !== null) {
        slice('sync', tid, b.startMs, b.startMs + b.syncMs);
        if (b.awaitMs !== null)
          slice(
            'await',
            tid,
            b.startMs + b.syncMs,
            b.startMs + b.syncMs + b.awaitMs,
          );
      }
      if (b.finishMs !== null) slice('finish', tid, end - b.finishMs, end);
    }
    for (const i of run.inits) {
      const tid = tids.get(i.providerId);
      if (tid !== undefined)
        slice('onInit', tid, i.startMs, i.startMs + i.durationMs);
    }

    if (report.graph === null) return;
    const path = criticalPathOf(run, report.graph).path;
    // A barrier-path member and the member before it, as an edge key.
    const critical = new Set(
      path.slice(1).map((p, i) => `${p.providerId} ${path[i]?.providerId}`),
    );
    const byId = new Map(run.builds.map((b) => [b.providerId, b]));
    for (const e of report.graph.edges) {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (!e.ordersBuild || from === undefined || to === undefined) continue;
      const id = ++flow;
      const name = critical.has(`${e.from} ${e.to}`) ? 'critical' : 'dep';
      events.push(
        {
          name,
          cat: 'dep',
          ph: 's',
          id,
          pid,
          tid: tids.get(to.providerId),
          // 1 µs inside each end, clamped to the slice, so a zero-length
          // slice on a coarse browser clock keeps its arrow.
          ts: Math.max(us(to.startMs), us(to.startMs + to.durationMs) - 1),
        },
        {
          name,
          cat: 'dep',
          ph: 'f',
          bp: 'e',
          id,
          pid,
          tid: tids.get(from.providerId),
          ts: Math.min(
            us(from.startMs) + 1,
            us(from.startMs + from.durationMs),
          ),
        },
      );
    }
  });
  return {
    traceEvents: events,
    metadata: { 'nexusdi-profile': 1 },
    displayTimeUnit: 'ms',
  };
}
