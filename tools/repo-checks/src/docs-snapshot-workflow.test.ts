import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * docs-snapshot.yml is the only place the Docusaurus toolchain runs (spec
 * §15.2). It runs by hand, rarely, so a broken edit shows up on the day an RC
 * post has to go out. These assertions hold the parts a reviewer would miss.
 */
const path = join(workspaceRoot, '.github/workflows/docs-snapshot.yml');
const source = readFileSync(path, 'utf8');
const workflow = parse(source) as {
  on: Record<string, { inputs?: Record<string, { default?: string }> }>;
  permissions: Record<string, string>;
  jobs: Record<
    string,
    {
      needs?: string | string[];
      permissions?: Record<string, string>;
      steps: { uses?: string; run?: string; with?: Record<string, unknown> }[];
    }
  >;
};
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

describe('docs-snapshot.yml', () => {
  it('runs on workflow_dispatch only, from 6d5e4f3 by default', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch.inputs?.source?.default).toBe(
      '6d5e4f3',
    );
  });

  it('grants no write token at workflow level', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('runs npm only in a read-only build job, and grants the write permissions to publish alone', () => {
    expect(workflow.jobs.build.permissions).toEqual({ contents: 'read' });
    expect(
      workflow.jobs.build.steps.some((step) => step.run?.includes('npm ci')),
    ).toBe(true);
    expect(workflow.jobs.publish.needs).toBe('build');
    expect(workflow.jobs.publish.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
    expect(
      workflow.jobs.publish.steps.some((step) => step.run?.includes('npm ')),
    ).toBe(false);
  });

  it('persists no checkout credentials in the build job', () => {
    const checkouts = workflow.jobs.build.steps.filter((step) =>
      step.uses?.startsWith('actions/checkout@'),
    );
    expect(checkouts.length).toBeGreaterThan(0);
    for (const checkout of checkouts) {
      expect(checkout.with?.['persist-credentials']).toBe(false);
    }
  });

  it('hands the tarballs and checksums from build to publish as an artifact', () => {
    expect(
      workflow.jobs.build.steps.some((step) =>
        step.uses?.startsWith('actions/upload-artifact@'),
      ),
    ).toBe(true);
    expect(
      workflow.jobs.publish.steps.some((step) =>
        step.uses?.startsWith('actions/download-artifact@'),
      ),
    ).toBe(true);
  });

  it('pins every action by commit SHA with its version in a comment', () => {
    const uses = [...source.matchAll(/uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const [, action, rest] of uses) {
      expect(action, `${action} must be pinned by a 40-character SHA`).toMatch(
        /@[0-9a-f]{40}$/,
      );
      expect(rest, `${action} must name its version in a comment`).toMatch(
        /#\s*v\d/,
      );
    }
  });

  it('builds on Node 22', () => {
    const setup = steps.find((step) =>
      step.uses?.startsWith('actions/setup-node@'),
    );
    expect(setup?.with?.['node-version']).toBe(22);
  });

  it('copies the overlay into the site directory', () => {
    expect(source).toContain('cp -R apps/docs/snapshot/. snapshot-src/docs/');
  });

  it('builds both variants with their overlay configs', () => {
    expect(source).toContain('--config docusaurus.overlay.root.ts');
    expect(source).toContain('--config docusaurus.overlay.archive.ts');
  });

  it('removes CNAME from both builds and writes SHA256SUMS', () => {
    expect(source).toMatch(/rm -f build-root\/CNAME build-archive\/CNAME/);
    expect(source).toContain('sha256sum');
    expect(source).toContain('SHA256SUMS');
  });

  it('marks the release as not latest', () => {
    expect(source).toContain('--latest=false');
  });
});
