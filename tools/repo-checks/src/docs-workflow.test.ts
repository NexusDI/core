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
    workflow_dispatch: {
      inputs?: Record<
        string,
        { type?: string; default?: string; options?: string[] }
      >;
    };
  };
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<
    string,
    {
      if?: string;
      needs?: string | string[];
      environment?: unknown;
      permissions?: Record<string, string>;
      outputs?: Record<string, string>;
      steps: {
        id?: string;
        name?: string;
        if?: string;
        uses?: string;
        run?: string;
        env?: Record<string, string>;
        with?: Record<string, unknown>;
      }[];
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

  it('grants no write token at workflow level', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('grants the Pages permissions to the deploy job only', () => {
    expect(workflow.jobs.build.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.deploy.permissions).toEqual({
      pages: 'write',
      'id-token': 'write',
    });
    expect(workflow.jobs.smoke.permissions).toEqual({ contents: 'read' });
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
      'build-site.mjs',
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

  it('validates archives.json before building anything', () => {
    const validate = source.indexOf(
      'node apps/docs/tools/deploy/archives.mjs apps/docs/archives.json',
    );
    expect(validate).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(source.indexOf('build-site.mjs'));
  });

  it('picks the /next/ source before the /next/ build, under the same condition', () => {
    const steps = workflow.jobs.build.steps;
    const pick = steps.findIndex((step) => step.id === 'next');
    const build = steps.findIndex(
      (step) => step.name === 'Build the /next/ site',
    );
    expect(steps[pick]?.run).toBe(
      'node apps/docs/tools/deploy/next-source.mjs',
    );
    expect(pick).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(pick);
    expect(steps[pick]?.if).toBe(steps[build]?.if);
  });

  it('builds /next/ from a release branch in its own worktree with its own install', () => {
    const build = workflow.jobs.build.steps.find(
      (step) => step.name === 'Build the /next/ site',
    );
    expect(build?.env).toMatchObject({
      NEXT_IS_MAIN: '${{ steps.next.outputs.is_main }}',
      NEXT_SHA: '${{ steps.next.outputs.sha }}',
    });
    expect(build?.run).toContain(
      'git worktree add --detach build/next-src "$NEXT_SHA"',
    );
    expect(build?.run).toContain('(cd build/next-src && npm ci)');
    expect(build?.run).toContain(
      'node apps/docs/tools/deploy/build-site.mjs next --tree build/next-src --out build/next-out',
    );
    expect(build?.run).toContain(
      'node apps/docs/tools/deploy/build-site.mjs next --tree . --out build/next-out',
    );
  });

  it('builds the root from the release tag with the blog from main', () => {
    const build = workflow.jobs.build.steps.find(
      (step) => step.name === 'Build the root site from the release',
    );
    expect(build?.run).toContain(
      'node apps/docs/tools/deploy/build-site.mjs root --tree build/root-src --main . --out build/root-out',
    );
    // The copy lives in build-site.mjs, which fails with the fix when main
    // has no blog (docs spec decision 35).
    expect(source).not.toContain('cp -R apps/docs/content/blog');
  });

  it('rehearses a mode by hand without deploying it', () => {
    expect(workflow.on.workflow_dispatch.inputs?.rehearse).toEqual({
      description:
        'Build and check this mode without deploying it. none deploys the mode deploy.json names.',
      type: 'choice',
      default: 'none',
      options: ['none', 'rc', 'final'],
    });
    const mode = workflow.jobs.build.steps.find((step) => step.id === 'mode');
    expect(mode?.env).toEqual({
      CONFIG_MODE: '${{ steps.config.outputs.mode }}',
      REHEARSE: '${{ inputs.rehearse }}',
    });
    expect(workflow.jobs.build.outputs).toEqual({
      mode: '${{ steps.mode.outputs.mode }}',
      rehearse: '${{ steps.mode.outputs.rehearse }}',
    });
    expect(workflow.jobs.deploy.if).toBe(
      "needs.build.outputs.rehearse == 'false'",
    );
    expect(workflow.jobs.smoke.if).toBe(
      "needs.build.outputs.rehearse == 'false'",
    );
  });

  it('reads the mode from the mode step only', () => {
    // Every step after the mode step decides on the rehearsed or deployed
    // mode, never on deploy.json's alone.
    const steps = workflow.jobs.build.steps;
    const at = steps.findIndex((step) => step.id === 'mode');
    for (const step of steps.slice(at + 1)) {
      expect(JSON.stringify(step)).not.toContain('steps.config.outputs.mode');
    }
  });

  it('passes the /next/ source to run scripts through env only', () => {
    // The branch name and commit come from the remote, so no run script
    // expands them as a template.
    for (const step of workflow.jobs.build.steps) {
      expect(step.run ?? '').not.toContain('steps.next.outputs');
    }
  });
});
