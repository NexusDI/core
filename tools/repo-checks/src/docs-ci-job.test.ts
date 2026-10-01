import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * `docs-ci-job` (docs spec §14.3): ci.yml's `docs` job builds the tree the way
 * docs.yml does and checks an rc and a final artifact, so a change that would
 * break either deploy fails before it merges.
 */
const source = readFileSync(
  join(workspaceRoot, '.github/workflows/ci.yml'),
  'utf8',
);
const job = (
  parse(source) as {
    jobs: Record<
      string,
      {
        if?: string;
        permissions?: Record<string, string>;
        steps: {
          id?: string;
          name?: string;
          if?: string;
          uses?: string;
          run?: string;
          with?: Record<string, unknown>;
        }[];
      }
    >;
  }
).jobs['docs'];

const docsYml = parse(
  readFileSync(join(workspaceRoot, '.github/workflows/docs.yml'), 'utf8'),
) as { on: { push: { paths: string[] } } };

// The filter is plain JavaScript in the docs app; a computed dynamic import
// reads it without making repo-checks depend on @nexusdi/docs.
const { DOCS_YML_PATHS } = (await import(
  pathToFileURL(join(workspaceRoot, 'apps/docs/tools/deploy/docs-changed.mjs'))
    .href
)) as { DOCS_YML_PATHS: string[] };

describe('the docs change filter', () => {
  it("holds a copy of docs.yml's push paths", () => {
    expect(DOCS_YML_PATHS).toEqual(docsYml.on.push.paths);
  });
});

describe('ci.yml docs job', () => {
  it('exists and reads the repository only', () => {
    expect(job).toBeDefined();
    expect(job?.permissions).toEqual({ contents: 'read' });
  });

  it('has no job-level condition, so it always reports a conclusion', () => {
    expect(job?.if).toBeUndefined();
  });

  it('checks out every commit, so the change filter can diff', () => {
    const checkout = job?.steps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    );
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  it('runs every later step only when the change touches a docs input', () => {
    const steps = job?.steps ?? [];
    const filter = steps.findIndex((step) => step.id === 'changed');
    expect(steps[filter]?.run).toBe(
      'node apps/docs/tools/deploy/docs-changed.mjs "$BASE"',
    );
    for (const step of steps.slice(filter + 1)) {
      expect(step.if).toBe("steps.changed.outputs.touched == 'true'");
    }
  });

  it('builds /next/ and the root with the deploy script, then checks rc and final', () => {
    const runs = (job?.steps ?? []).map((step) => step.run ?? '').join('\n');
    const order = [
      'build-site.mjs next --tree . --out build/next-out',
      'build-site.mjs root --tree . --main . --out build/root-out',
      'snapshot-assets.mjs verify',
      'DEPLOY_MODE=rc',
      'check-artifact.mjs site-rc rc',
      'DEPLOY_MODE=final',
      'check-artifact.mjs site-final final',
    ].map((needle) => runs.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
