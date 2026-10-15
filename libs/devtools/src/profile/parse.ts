import { DevtoolsError } from '../devtools-error.js';
import type { ProfileReport } from './report.js';

type Check = (value: unknown, path: string) => void;

function fail(path: string, what: string): never {
  throw new DevtoolsError(
    { code: 'NEXUS_DEVTOOLS_PROFILE_INVALID', path },
    {
      text: `not a ProfileReport: ${path} ${what}.\n  Fix: re-record the report with this version of @nexusdi/devtools.`,
    },
  );
}

const WRONG = 'is missing or has the wrong type';
const num: Check = (v, p) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, WRONG);
};
const str: Check = (v, p) => {
  if (typeof v !== 'string') fail(p, WRONG);
};
const bool: Check = (v, p) => {
  if (typeof v !== 'boolean') fail(p, WRONG);
};
const orNull =
  (check: Check): Check =>
  (v, p) => {
    if (v !== null) check(v, p);
  };
const optional =
  (check: Check): Check =>
  (v, p) => {
    if (v !== undefined) check(v, p);
  };
const literal =
  (expected: unknown, what: string): Check =>
  (v, p) => {
    if (v !== expected) fail(p, what);
  };
const oneOf =
  (values: readonly string[]): Check =>
  (v, p) => {
    if (typeof v !== 'string' || !values.includes(v)) fail(p, WRONG);
  };
const list =
  (each: Check): Check =>
  (v, p) => {
    if (!Array.isArray(v)) fail(p, WRONG);
    v.forEach((item, i) => each(item, `${p}[${i}]`));
  };
const shape =
  (fields: Readonly<Record<string, Check>>): Check =>
  (v, p) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(p, WRONG);
    for (const [key, check] of Object.entries(fields))
      check(
        (v as Record<string, unknown>)[key],
        p === '(root)' ? key : `${p}.${key}`,
      );
  };

const SPAN = { startMs: num, durationMs: num };
const BUILD = shape({
  providerId: str,
  token: str,
  module: str,
  // Any string, for the same reason as a run's kind.
  lifetime: orNull(str),
  scope: orNull(str),
  async: bool,
  level: orNull(num),
  parent: orNull(str),
  startMs: num,
  syncMs: orNull(num),
  awaitMs: orNull(num),
  finishMs: orNull(num),
  durationMs: num,
  failed: bool,
});
const INIT = shape({
  providerId: str,
  token: str,
  level: orNull(num),
  async: bool,
  startMs: num,
  syncMs: orNull(num),
  awaitMs: orNull(num),
  durationMs: num,
  failed: bool,
});
const RUN = shape({
  id: num,
  // Any string: a report from a newer core may carry a kind outside RunKind.
  kind: str,
  scope: orNull(str),
  ok: orNull(bool),
  startMs: num,
  durationMs: orNull(num),
  compile: orNull(
    shape({ ...SPAN, modules: num, providers: num, errors: num }),
  ),
  steps: list(
    shape({
      step: oneOf(['compile', 'static', 'build', 'init', 'setup']),
      ...SPAN,
    }),
  ),
  builds: list(BUILD),
  inits: list(INIT),
  pending: list(
    shape({
      providerId: str,
      token: str,
      module: str,
      level: orNull(num),
      what: oneOf(['construct', 'init']),
      startMs: num,
      syncMs: num,
    }),
  ),
});
const REPORT = shape({
  format: literal('nexusdi-profile', "is not 'nexusdi-profile'"),
  version: literal(1, 'is not 1, the version this @nexusdi/devtools reads'),
  timeOrigin: num,
  reportedMs: num,
  runs: list(RUN),
  graph: orNull(
    shape({
      root: str,
      providers: list(
        shape({
          id: str,
          token: str,
          module: str,
          lifetime: orNull(str),
          kind: str,
          inline: bool,
        }),
      ),
      edges: list(shape({ from: str, to: str, kind: str, ordersBuild: bool })),
    }),
  ),
  dropped: num,
  dispose: orNull(shape({ ...SPAN, errors: num })),
  environment: optional(shape({ node: str, core: str })),
});

/** Throws NEXUS_DEVTOOLS_PROFILE_INVALID with the path of the first bad field. */
export function parseProfileReport(value: unknown): ProfileReport {
  REPORT(value, '(root)');
  return value as ProfileReport;
}
