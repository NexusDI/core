import type {
  ProfileBuild,
  ProfileReport,
  ProfileRun,
} from '../src/profile/report.js';

/** A level build that took `durationMs`, all of it sync unless `awaitMs` says otherwise. */
export function build(
  fields: Partial<ProfileBuild> &
    Pick<ProfileBuild, 'providerId' | 'token' | 'startMs' | 'durationMs'>,
): ProfileBuild {
  const awaitMs = fields.awaitMs ?? null;
  return {
    module: 'Engineering',
    lifetime: 'singleton',
    scope: null,
    async: awaitMs !== null,
    level: 0,
    parent: null,
    syncMs: fields.durationMs - (awaitMs ?? 0),
    awaitMs,
    finishMs: 0,
    failed: false,
    ...fields,
  };
}

/** A report of one settled create run over `builds`, with a graph of `edges`. */
export function report(
  builds: readonly ProfileBuild[],
  edges: readonly (readonly [from: string, to: string])[] = [],
  run: Partial<ProfileRun> = {},
): ProfileReport {
  const end = Math.max(0, ...builds.map((b) => b.startMs + b.durationMs));
  return {
    format: 'nexusdi-profile',
    version: 1,
    timeOrigin: 0,
    reportedMs: end + 1,
    runs: [
      {
        id: 0,
        kind: 'create',
        scope: null,
        ok: true,
        startMs: 0,
        durationMs: end + 1,
        compile: {
          startMs: 0,
          durationMs: 0,
          modules: 1,
          providers: builds.length,
          errors: 0,
        },
        steps: [],
        builds,
        inits: [],
        pending: [],
        ...run,
      },
    ],
    graph: {
      root: 'Meridian',
      providers: builds.map((b) => ({
        id: b.providerId,
        token: b.token,
        module: b.module,
        lifetime: b.lifetime,
        kind: 'class',
        inline: false,
      })),
      edges: edges.map(([from, to]) => ({
        from,
        to,
        kind: 'required',
        ordersBuild: true,
      })),
    },
    dropped: 0,
    dispose: null,
  };
}
