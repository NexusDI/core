import type { ProfileRun, ProfileStep } from './report.js';

/**
 * create, load 1, s3, s3 extend 4. A report that parseProfileReport read
 * may come from a newer core and carry a kind outside RunKind; the last
 * line names it as given.
 */
export function runLabel(
  run: Pick<ProfileRun, 'id' | 'kind' | 'scope'>,
): string {
  if (run.kind === 'create') return 'create';
  if (run.kind === 'load') return `load ${run.id}`;
  if (run.kind === 'createScope' && run.scope !== null) return run.scope;
  if (run.kind === 'extend' && run.scope !== null)
    return `${run.scope} extend ${run.id}`;
  return `${run.kind} ${run.id}`;
}

function span(
  step: ProfileStep['step'],
  spans: readonly (readonly [start: number, end: number])[],
): ProfileStep[] {
  if (spans.length === 0) return [];
  const startMs = Math.min(...spans.map(([s]) => s));
  const end = Math.max(...spans.map(([, e]) => e));
  return [{ step, startMs, durationMs: end - startMs }];
}

/**
 * The startup steps of a run, derived from its event spans (spec 7.2).
 * Static work is the value and alias providers and options schemas: the
 * construct events with lifetime null and no level. Build runs from the first level build's start to the last
 * one's end; setup runs from the last build or init end to the run's end.
 */
export function stepsOf(run: Omit<ProfileRun, 'steps'>): ProfileStep[] {
  const ends = (b: { startMs: number; durationMs: number }) =>
    [b.startMs, b.startMs + b.durationMs] as const;
  const compile = run.compile === null ? [] : [ends(run.compile)];
  const statics = run.builds
    .filter((b) => b.level === null && b.lifetime === null)
    .map(ends);
  const levelled = run.builds.filter((b) => b.level !== null).map(ends);
  const inits = run.inits.map(ends);
  const steps = [
    ...span('compile', compile),
    ...span('static', statics),
    ...span('build', levelled),
    ...span('init', inits),
  ];
  if (run.durationMs !== null) {
    const last = Math.max(
      run.startMs,
      ...[...levelled, ...inits].map(([, e]) => e),
    );
    const end = run.startMs + run.durationMs;
    if (end > last || steps.length > 0)
      steps.push({
        step: 'setup',
        startMs: last,
        durationMs: Math.max(0, end - last),
      });
  }
  return steps;
}
