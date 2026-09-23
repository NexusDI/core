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
