import { criticalPathOf, ownMs } from './critical-path.js';
import type { ProfileBuild, ProfileReport, ProfileRun } from './report.js';
import { runLabel, stepsOf } from './steps.js';

/** A colour name DevTools draws a custom-track span in. */
export type SpanColor =
  | 'primary'
  | 'primary-light'
  | 'primary-dark'
  | 'secondary'
  | 'secondary-light'
  | 'secondary-dark'
  | 'tertiary'
  | 'tertiary-light'
  | 'tertiary-dark'
  | 'error';
/** One span of a run, as live mode and the Chrome file draw it. */
export interface Span {
  readonly name: string;
  readonly track: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly color: SpanColor;
  readonly tooltip: string;
  readonly properties: readonly (readonly [string, string])[];
  readonly marker: boolean;
}

const ms = (n: number): string => n.toFixed(1);

function span(
  name: string,
  track: string,
  startMs: number,
  endMs: number,
  color: SpanColor,
  tooltip = name,
  properties: Span['properties'] = [],
): Span {
  return {
    name,
    track,
    startMs,
    endMs,
    color,
    tooltip,
    properties,
    marker: false,
  };
}

/** The spans of one run, in the layout of spec 7.3. live.ts and chrome.ts both draw these. */
export function spansOf(
  run: ProfileRun,
  graph: ProfileReport['graph'],
  reportedMs: number,
): Span[] {
  const label = runLabel(run);
  const end =
    run.durationMs === null ? reportedMs : run.startMs + run.durationMs;
  const critical = new Set(
    graph === null
      ? []
      : criticalPathOf(run, graph).path.map((p) => p.providerId),
  );
  const spans: Span[] = [
    span(label, 'Runs', run.startMs, end, 'secondary-dark'),
  ];
  for (const s of run.steps.length > 0 ? run.steps : stepsOf(run))
    spans.push(
      span(s.step, 'Steps', s.startMs, s.startMs + s.durationMs, 'tertiary'),
    );

  const provider = (b: ProfileBuild & { level: number }): void => {
    const track = `${label} · level ${b.level}`;
    const stop = b.startMs + b.durationMs;
    const onPath = critical.has(b.providerId);
    const queued = b.failed ? null : Math.max(0, b.durationMs - ownMs(b));
    const tooltip =
      `${b.token} ${ms(b.durationMs)} ms` +
      (b.syncMs === null
        ? ''
        : ` (${ms(b.syncMs)} sync${b.awaitMs === null ? '' : `, ${ms(b.awaitMs)} await`})`) +
      (b.failed ? ', failed' : onPath ? ', critical path' : '');
    spans.push(
      span(
        b.token,
        track,
        b.startMs,
        stop,
        b.failed ? 'error' : onPath ? 'primary-dark' : 'primary',
        tooltip,
        [
          ['module', b.module],
          ['lifetime', b.lifetime ?? '-'],
          ['level', String(b.level)],
          ['sync ms', b.syncMs === null ? '-' : ms(b.syncMs)],
          ['await ms', b.awaitMs === null ? '-' : ms(b.awaitMs)],
          ['finish ms', b.finishMs === null ? '-' : ms(b.finishMs)],
          ['queued ms', queued === null ? '-' : ms(queued)],
          ['run', label],
          ['critical path', onPath ? 'yes' : 'no'],
        ],
      ),
    );
    if (b.syncMs === null) return;
    spans.push(
      span('sync', track, b.startMs, b.startMs + b.syncMs, 'primary-light'),
    );
    if (b.awaitMs !== null)
      spans.push(
        span(
          'await',
          track,
          b.startMs + b.syncMs,
          b.startMs + b.syncMs + b.awaitMs,
          'secondary',
        ),
      );
    if (b.finishMs !== null)
      spans.push(
        span('finish', track, stop - b.finishMs, stop, 'tertiary-light'),
      );
  };
  for (const b of run.builds)
    if (b.level !== null) provider(b as ProfileBuild & { level: number });

  for (const i of run.inits)
    spans.push(
      span(
        i.token,
        `${label} · onInit`,
        i.startMs,
        i.startMs + i.durationMs,
        i.failed ? 'error' : 'primary',
        `${i.token} onInit ${ms(i.durationMs)} ms${i.failed ? ', failed' : ''}`,
      ),
    );

  for (const p of run.pending)
    spans.push(
      span(
        p.token,
        p.what === 'init'
          ? `${label} · onInit`
          : `${label} · level ${p.level ?? 0}`,
        p.startMs,
        reportedMs,
        'error',
        `${p.token} still awaiting at timeout`,
      ),
    );

  if (run.ok !== null)
    spans.push({
      ...span(
        `${label} ${run.ok ? 'ready' : 'failed'}`,
        'Runs',
        end,
        end,
        run.ok ? 'tertiary-dark' : 'error',
      ),
      marker: true,
    });
  return spans;
}
