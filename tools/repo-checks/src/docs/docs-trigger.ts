/** The path filter of spec section 15.3. */
export const REQUIRED_PATHS = [
  'apps/docs/**',
  'libs/**',
  'internal/**',
  'examples/meridian/**',
  'tools/doc-examples/**',
  'package.json',
  'package-lock.json',
  '.github/workflows/docs.yml',
] as const;

/** Whether a root directory or file sits under one of the globs. */
export function covers(globs: readonly string[], root: string): boolean {
  return globs.some((glob) =>
    glob.endsWith('/**')
      ? root === glob.slice(0, -3) || root.startsWith(glob.slice(0, -2))
      : root === glob,
  );
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? [value]
      : [];
}

/**
 * `docs.yml` runs on every change the site builds from. `roots` are the
 * released projects and the projects `@nexusdi/docs` depends on, read from the
 * project graph by the live test; a root no path covers deploys nothing and
 * reports nothing.
 */
export function checkTrigger(
  workflow: unknown,
  roots: readonly string[],
): string[] {
  const on = ((workflow as { on?: unknown })?.on ?? {}) as Record<
    string,
    unknown
  >;
  const push = (on.push ?? {}) as Record<string, unknown>;
  const paths = strings(push.paths);
  const findings: string[] = [];

  if (!strings(push.branches).includes('main')) {
    findings.push("docs.yml: on.push.branches lacks 'main'.");
  }
  if (strings(push.tags).length > 0) {
    findings.push(
      "docs.yml: on.push.tags is set. GitHub Pages' default environment " +
        'protection rule allows only the default branch, so a tag-triggered ' +
        'run fails at the deploy job. release.yml dispatches docs.yml on ' +
        'main after a successful publish.',
    );
  }
  if (!('workflow_dispatch' in on)) {
    findings.push(
      'docs.yml: on.workflow_dispatch is missing. A person must be able to redeploy by hand.',
    );
  }
  for (const path of REQUIRED_PATHS) {
    if (!paths.includes(path))
      findings.push(
        `docs.yml: on.push.paths lacks '${path}' (spec section 15.3).`,
      );
  }
  for (const root of roots) {
    if (!covers(paths, root)) {
      findings.push(
        `docs.yml: on.push.paths does not cover '${root}', a project the site builds from. A change there would deploy nothing.`,
      );
    }
  }

  return findings.sort();
}

const DISPATCH = 'gh workflow run docs.yml --ref main';

function list(values: readonly string[]): string {
  return `[${values.map((value) => `'${value}'`).join(', ')}]`;
}

/**
 * `docs-next.yml` (release spec §7.2; docs spec §15, amended 2026-10-01)
 * redeploys the site when a release branch changes, because /next/ builds
 * from the highest release branch ahead of main. Pages deploys from main
 * only, so the workflow only asks docs.yml to run on main. It holds
 * actions: write, so it runs nothing else. `docsPaths` is docs.yml's
 * on.push.paths: a release branch change docs.yml would build on main has to
 * reach /next/ too.
 */
export function checkNextTrigger(
  nextWorkflow: unknown,
  docsPaths: readonly string[],
): string[] {
  const workflow = (nextWorkflow ?? {}) as {
    on?: unknown;
    permissions?: unknown;
    jobs?: unknown;
  };
  const on = (workflow.on ?? {}) as Record<string, unknown>;
  const push = (on.push ?? {}) as Record<string, unknown>;
  const branches = strings(push.branches);
  const paths = strings(push.paths);
  const findings: string[] = [];

  if (branches.length !== 1 || branches[0] !== 'release/**') {
    findings.push(
      `docs-next.yml: on.push.branches must be exactly ['release/**']; found ${list(branches)}.`,
    );
  }
  for (const key of Object.keys(push)) {
    if (key !== 'branches' && key !== 'paths') {
      findings.push(
        `docs-next.yml: on.push.${key} is set. The workflow filters on branches and paths only.`,
      );
    }
  }
  for (const event of Object.keys(on)) {
    if (event !== 'push') {
      findings.push(
        `docs-next.yml: on.${event} is set. The workflow runs on release branch pushes only.`,
      );
    }
  }
  for (const path of docsPaths) {
    if (!paths.includes(path)) {
      findings.push(
        `docs-next.yml: on.push.paths lacks '${path}', which docs.yml lists. A change there on a release branch would leave /next/ stale.`,
      );
    }
  }
  for (const path of paths) {
    if (!docsPaths.includes(path)) {
      findings.push(
        `docs-next.yml: on.push.paths lists '${path}', which docs.yml does not. The two lists are the same.`,
      );
    }
  }

  const permissions = workflow.permissions;
  const granted =
    typeof permissions === 'object' && permissions !== null
      ? Object.entries(permissions as Record<string, unknown>)
      : [];
  if (
    granted.length !== 1 ||
    granted[0]?.[0] !== 'actions' ||
    granted[0][1] !== 'write'
  ) {
    const found =
      granted.length > 0
        ? `{ ${granted.map(([scope, level]) => `${scope}: ${String(level)}`).join(', ')} }`
        : JSON.stringify(permissions ?? null);
    findings.push(
      `docs-next.yml: permissions must be exactly { actions: write }; found ${found}.`,
    );
  }

  let dispatches = 0;
  const jobs = (workflow.jobs ?? {}) as Record<string, unknown>;
  for (const [name, value] of Object.entries(jobs)) {
    const job = (value ?? {}) as { permissions?: unknown; steps?: unknown };
    if (job.permissions !== undefined) {
      findings.push(
        `docs-next.yml: jobs.${name} sets its own permissions. The workflow grants actions: write at the top level and nothing else.`,
      );
    }
    const steps = Array.isArray(job.steps) ? job.steps : [];
    for (const step of steps as { uses?: unknown; run?: unknown }[]) {
      if (step.uses !== undefined) {
        findings.push(
          `docs-next.yml: jobs.${name} uses ${String(step.uses)}. The dispatch needs no checkout and no action.`,
        );
      }
      if (step.run === undefined) continue;
      if (String(step.run).trim() === DISPATCH) {
        dispatches += 1;
      } else {
        findings.push(
          `docs-next.yml: jobs.${name} runs a step other than '${DISPATCH}'. The job holds actions: write, so it runs nothing else.`,
        );
      }
    }
  }
  if (dispatches === 0) {
    findings.push(`docs-next.yml: no step runs '${DISPATCH}'.`);
  }

  return findings.sort();
}
