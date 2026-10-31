import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * ci.yml's `docs-e2e` job runs the docs suite in the Playwright image, where
 * the bay's baselines are drawn. The image tag is the version of
 * `@playwright/test` that the lockfile installs, so the browsers in the image
 * are the ones the package drives.
 */
const ci = parse(
  readFileSync(join(workspaceRoot, '.github/workflows/ci.yml'), 'utf8'),
) as {
  jobs: Record<
    string,
    {
      container?: { image?: string };
      env?: Record<string, string>;
      steps: { run?: string; uses?: string }[];
    }
  >;
};
const lock = JSON.parse(
  readFileSync(join(workspaceRoot, 'package-lock.json'), 'utf8'),
) as { packages: Record<string, { version?: string }> };

describe('ci.yml docs-e2e job', () => {
  const job = ci.jobs['docs-e2e'];

  it('runs in the Playwright image of the lockfile version', () => {
    const version = lock.packages['node_modules/@playwright/test']?.version;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(job?.container?.image).toBe(
      `mcr.microsoft.com/playwright:v${version}-noble`,
    );
  });

  it('keeps Nx Cloud off and runs the docs-e2e target', () => {
    expect(job?.env?.['NX_NO_CLOUD']).toBe('true');
    expect(
      job?.steps.some((step) => step.run === 'npx nx e2e @nexusdi/docs-e2e'),
    ).toBe(true);
  });

  it('pins every action it uses to a commit', () => {
    for (const step of job?.steps ?? [])
      if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
  });
});
