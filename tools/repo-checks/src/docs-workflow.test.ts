import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * docs.yml builds and deploys nexus.js.org (docs spec §15.3). The trigger
 * paths are docs-trigger's; this holds the rest.
 */
const source = readFileSync(
  join(workspaceRoot, '.github/workflows/docs.yml'),
  'utf8',
);
const workflow = parse(source) as {
  on: {
    push: { branches: string[]; tags?: string[] };
    workflow_dispatch: unknown;
  };
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<
    string,
    {
      needs?: string | string[];
      environment?: unknown;
      steps: { uses?: string; run?: string; with?: Record<string, unknown> }[];
    }
  >;
};

describe('docs.yml', () => {
  it('deploys from main and by hand, never from a tag', () => {
    // GitHub Pages' default environment protection rule allows only the
    // default branch, so a tag push can never reach the deploy job.
    // release.yml dispatches this workflow on main after a publish instead.
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on.push.tags).toBeUndefined();
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('holds the Pages permissions and nothing more', () => {
    expect(workflow.permissions).toEqual({
      contents: 'read',
      pages: 'write',
      'id-token': 'write',
    });
  });

  it('never cancels a deploy half-way', () => {
    expect(workflow.concurrency).toEqual({
      group: 'pages',
      'cancel-in-progress': false,
    });
  });

  it('pins every action by commit SHA with its version in a comment', () => {
    for (const [, action, rest] of source.matchAll(/uses:\s*(\S+)(.*)$/gm)) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
      expect(rest).toMatch(/#\s*v\d/);
    }
  });

  it('checks out every tag for the release notice and the root build', () => {
    const checkout = workflow.jobs.build.steps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    );
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  it('verifies each snapshot asset before unpacking it', () => {
    const verify = source.indexOf('snapshot-assets.mjs verify');
    const unpack = source.indexOf('tar -xzf');
    expect(verify).toBeGreaterThan(-1);
    expect(unpack).toBeGreaterThan(verify);
  });

  it('runs the budget check, the assembly and the artifact check in that order', () => {
    const order = [
      'check-budgets.mjs',
      'assemble.mjs',
      'check-artifact.mjs',
      'upload-pages-artifact',
    ].map((needle) => source.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('smoke-tests after the deploy', () => {
    expect(workflow.jobs.smoke.needs).toEqual(['build', 'deploy']);
    expect(source).toContain(
      'node apps/docs/tools/deploy/smoke.mjs https://nexus.js.org',
    );
  });
});
