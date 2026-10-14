import { least, most } from './extent.js';
import { criticalPathOf, ownMs } from './critical-path.js';
import type { ProfileBuild, ProfileReport, ProfileRun } from './report.js';
import { runLabel, stepsOf } from './steps.js';

const ms = (n: number | null): string => (n === null ? '-' : n.toFixed(1));

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length === 0
    ? 0
    : s.length % 2 === 1
      ? (s[mid] ?? 0)
      : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Lines of padded columns; `right` marks the numeric ones. */
function columns(
  rows: readonly (readonly string[])[],
  right: readonly boolean[],
): string[] {
  const widths = right.map((_, i) =>
    most(
      rows.map((r) => (r[i] ?? '').length),
      0,
    ),
  );
  return rows.map((r) =>
    r
      .map((cell, i) =>
        right[i] ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0),
      )
      .join('  ')
      .trimEnd(),
  );
}

const spanOf = (run: ProfileRun): number =>
  run.durationMs ??
  most(
    run.builds.map((b) => b.startMs + b.durationMs - run.startMs),
    0,
  );

function pick(
  report: ProfileReport,
  id: number | undefined,
): ProfileRun | undefined {
  return id === undefined
    ? report.runs[0]
    : report.runs.find((r) => r.id === id);
}

/** Steps, slowest providers, levels and the critical path. Several reports: the first as cold, the rest as warm medians. */
export function profileTable(
  report: ProfileReport | readonly ProfileReport[],
  options: { readonly run?: number; readonly top?: number } = {},
): string {
  const reports: readonly ProfileReport[] = Array.isArray(report)
    ? report
    : [report as ProfileReport];
  const [cold, ...warm] = reports;
  const run = cold === undefined ? undefined : pick(cold, options.run);
  if (cold === undefined || run === undefined) return 'no run recorded\n';
  const warmRuns = warm.flatMap((r) => pick(r, options.run) ?? []);
  const lines: string[] = [];

  const status =
    run.ok === false ? ', failed' : run.ok === null ? ', still running' : '';
  lines.push(
    `${runLabel(run)} ${ms(spanOf(run))} ms${status}, cold` +
      (warmRuns.length > 0
        ? `; ${warmRuns.length} warm, median ${ms(median(warmRuns.map(spanOf)))} ms`
        : ''),
  );

  const steps = run.steps.length > 0 ? run.steps : stepsOf(run);
  const total = steps.reduce((sum, s) => sum + s.durationMs, 0);
  const levels = new Map<number, ProfileBuild[]>();
  for (const b of run.builds)
    if (b.level !== null)
      levels.set(b.level, [...(levels.get(b.level) ?? []), b]);
  const note = (step: string): string => {
    if (step === 'build')
      return `${levels.size} levels, ${run.builds.filter((b) => b.level !== null).length} providers, ${run.builds.filter((b) => b.async).length} async`;
    if (step === 'init') return `${run.inits.length} onInit`;
    return '';
  };
  const warmStep = (step: string): string =>
    warmRuns.length === 0
      ? ''
      : ms(
          median(
            warmRuns.map(
              (r) =>
                (r.steps.length > 0 ? r.steps : stepsOf(r)).find(
                  (s) => s.step === step,
                )?.durationMs ?? 0,
            ),
          ),
        );
  lines.push(
    '',
    ...columns(
      [
        [
          'step',
          'ms',
          'share',
          ...(warmRuns.length > 0 ? ['warm ms'] : []),
          '',
        ],
        ...steps.map((s) => [
          s.step,
          ms(s.durationMs),
          `${(total > 0 ? (s.durationMs / total) * 100 : 0).toFixed(1)}%`,
          ...(warmRuns.length > 0 ? [warmStep(s.step)] : []),
          note(s.step),
        ]),
      ],
      [false, true, true, ...(warmRuns.length > 0 ? [true] : []), false],
    ),
  );

  const rows = [...run.builds]
    .sort((a, b) => ownMs(b) - ownMs(a))
    .slice(0, options.top ?? 20);
  lines.push(
    '',
    'slowest providers',
    ...columns(
      [
        [
          'provider',
          'module',
          'level',
          'lifetime',
          'sync ms',
          'await ms',
          'finish ms',
          'own ms',
          'queued ms',
          '',
        ],
        ...rows.map((b) => [
          b.token,
          b.module,
          b.level === null ? '-' : String(b.level),
          b.lifetime ?? '-',
          ms(b.syncMs),
          ms(b.awaitMs),
          ms(b.finishMs),
          ms(ownMs(b)),
          ms(b.failed ? null : Math.max(0, b.durationMs - ownMs(b))),
          b.failed ? 'failed' : b.async ? 'async' : '',
        ]),
      ],
      [false, false, true, false, true, true, true, true, true, false],
    ),
  );

  if (levels.size > 0) {
    lines.push(
      '',
      'levels',
      ...columns(
        [
          ['level', 'providers', 'wall ms', 'slowest'],
          ...[...levels]
            .sort(([a], [b]) => a - b)
            .map(([level, builds]) => {
              const start = least(
                builds.map((b) => b.startMs),
                Infinity,
              );
              const end = most(
                builds.map((b) => b.startMs + b.durationMs),
                -Infinity,
              );
              const slowest = builds.reduce((a, b) =>
                ownMs(b) > ownMs(a) ? b : a,
              );
              return [
                String(level),
                String(builds.length),
                ms(end - start),
                `${slowest.token} ${ms(ownMs(slowest))}`,
              ];
            }),
        ],
        [true, true, true, false],
      ),
    );
  }

  if (cold.graph !== null && levels.size > 0) {
    const path = criticalPathOf(run, cold.graph);
    lines.push(
      '',
      `critical path, build ${ms(path.buildMs)} ms: dependency bound ${ms(path.boundMs)} ms, level barriers ${ms(path.barrierMs)} ms`,
      ...columns(
        path.path.map((p, i) => [
          `level ${p.level}`,
          p.token,
          `${ms(p.ownMs)} ms`,
          [
            i === 0
              ? ''
              : p.dependsOnPrevious
                ? `depends on ${path.path[i - 1]?.token ?? ''}`
                : p.latestDep === null
                  ? 'barrier: no dependency built in this run'
                  : `barrier: depends on ${p.latestDep.token}, which ended ${ms(p.latestDep.earlierMs)} ms earlier`,
            p.lateMs !== null && p.lateMs > 0
              ? `started ${ms(p.lateMs)} ms late, behind sync siblings`
              : '',
          ]
            .filter((note) => note !== '')
            .join('; '),
        ]),
        [false, false, true, false],
      ),
    );
    if (path.waits.length > 0)
      lines.push(
        '',
        'barrier waits (start minus the end of its own deps)',
        ...columns(
          path.waits.slice(0, 5).map((w) => [w.token, `${ms(w.waitMs)} ms`]),
          [false, true],
        ),
      );
  }

  if (run.pending.length > 0)
    lines.push(
      '',
      `still awaiting: ${run.pending
        .map(
          (p) =>
            `${p.token} (${p.module}) ${p.what === 'construct' ? 'factory' : 'onInit'}, ${ms(cold.reportedMs - p.startMs)} ms`,
        )
        .join('; ')}`,
    );
  if (cold.dispose !== null)
    lines.push(
      '',
      `dispose ${ms(cold.dispose.durationMs)} ms${cold.dispose.errors > 0 ? `, ${cold.dispose.errors} errors` : ''}`,
    );
  return `${lines.join('\n')}\n`;
}
