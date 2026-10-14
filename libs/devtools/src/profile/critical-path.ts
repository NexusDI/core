import { least, most } from './extent.js';
import type {
  CriticalPath,
  ProfileBuild,
  ProfileReport,
  ProfileRun,
} from './report.js';

type Graph = NonNullable<ProfileReport['graph']>;

export function ownMs(b: ProfileBuild): number {
  return (b.syncMs ?? 0) + (b.awaitMs ?? 0) + (b.finishMs ?? 0);
}

const endOf = (b: ProfileBuild): number => b.startMs + b.durationMs;

export function criticalPathOf(run: ProfileRun, graph: Graph): CriticalPath {
  const levelled = run.builds.filter(
    (b): b is ProfileBuild & { level: number } => b.level !== null && !b.failed,
  );
  if (levelled.length === 0)
    return {
      run: run.id,
      buildMs: 0,
      boundMs: 0,
      barrierMs: 0,
      path: [],
      waits: [],
    };
  const built = new Map(levelled.map((b) => [b.providerId, b]));
  // Core's rule, as the recording core stated it on the view (spec 3.7).
  const through = new Set(
    graph.providers.filter((p) => p.inline).map((p) => p.id),
  );
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!e.ordersBuild) continue;
    const list = out.get(e.from);
    if (list === undefined) out.set(e.from, [e.to]);
    else list.push(e.to);
  }
  /** The deps built in this run that `id` reaches, passing through transient and alias nodes. */
  const depsOf = (id: string): ProfileBuild[] => {
    const found: ProfileBuild[] = [];
    const seen = new Set<string>();
    const stack = [...(out.get(id) ?? [])];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (seen.has(next)) continue;
      seen.add(next);
      const b = built.get(next);
      if (b !== undefined) found.push(b);
      else if (through.has(next)) stack.push(...(out.get(next) ?? []));
    }
    return found;
  };

  const buildStart = least(
    levelled.map((b) => b.startMs),
    Infinity,
  );
  const buildEnd = most(levelled.map(endOf), -Infinity);
  const levels = [...new Set(levelled.map((b) => b.level))].sort(
    (a, b) => a - b,
  );

  const path: CriticalPath['path'][number][] = [];
  let previous: ProfileBuild | undefined;
  for (const level of levels) {
    const members = levelled.filter((b) => b.level === level);
    const levelStart = least(
      members.map((b) => b.startMs),
      Infinity,
    );
    const last = members.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
    const deps = depsOf(last.providerId);
    const latest =
      previous === undefined || deps.length === 0
        ? undefined
        : deps.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
    path.push({
      providerId: last.providerId,
      token: last.token,
      level,
      ownMs: ownMs(last),
      dependsOnPrevious: previous !== undefined && deps.includes(previous),
      lateMs: last.async ? last.startMs - levelStart : null,
      latestDep:
        latest === undefined || previous === undefined
          ? null
          : {
              providerId: latest.providerId,
              token: latest.token,
              earlierMs: endOf(previous) - endOf(latest),
            },
    });
    previous = last;
  }

  const waits = levelled
    .map((b) => {
      const deps = depsOf(b.providerId);
      const ready =
        deps.length === 0 ? buildStart : most(deps.map(endOf), -Infinity);
      return {
        providerId: b.providerId,
        token: b.token,
        waitMs: b.startMs - ready,
      };
    })
    .filter((w) => w.waitMs > 0)
    .sort((a, b) => b.waitMs - a.waitMs);

  const finish = new Map<string, number>();
  for (const b of [...levelled].sort((x, y) => x.level - y.level))
    finish.set(
      b.providerId,
      most(
        depsOf(b.providerId).map((d) => finish.get(d.providerId) ?? 0),
        0,
      ) + ownMs(b),
    );
  const boundMs = most(finish.values(), 0);
  const buildMs = buildEnd - buildStart;
  return {
    run: run.id,
    buildMs,
    boundMs,
    barrierMs: Math.max(0, buildMs - boundMs),
    path,
    waits,
  };
}

/** null when the report has no graph (no create reached setup) or no such run. */
export function criticalPath(
  report: ProfileReport,
  run: number,
): CriticalPath | null {
  const found = report.runs.find((r) => r.id === run);
  if (report.graph === null || found === undefined) return null;
  return criticalPathOf(found, report.graph);
}
