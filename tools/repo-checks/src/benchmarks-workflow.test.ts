import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const wf = parse(
  readFileSync(
    join(workspaceRoot, '.github/workflows/benchmarks.yml'),
    'utf-8',
  ),
);
const runs = (job: string) =>
  wf.jobs[job].steps.map((s: { run?: string }) => s.run ?? '').join('\n');
const uses = Object.values(
  wf.jobs as Record<string, { steps: Array<{ uses?: string }> }>,
).flatMap((j) => j.steps.map((s) => s.uses).filter(Boolean));

describe('benchmarks workflow', () => {
  it('pins every action by SHA', () => {
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });
  it('runs the deterministic check on pull requests that touch the harness or core', () => {
    expect(wf.on.pull_request.paths).toEqual(
      expect.arrayContaining([
        'benchmarks/**',
        'libs/core/**',
        'examples/toolchain-matrix/**',
        'tools/bench-kit/**',
      ]),
    );
    expect(runs('bench-check')).toContain('nx run @nexusdi/benchmarks:check');
    expect(runs('bench-check')).not.toMatch(/timings|build-times/);
  });
  it('runs the dispatch benchmark only when core source changes', () => {
    expect(wf.jobs.dispatch.needs).toBe('changes');
    expect(wf.jobs.dispatch.if).toContain(
      "needs.changes.outputs.core == 'true'",
    );
    expect(runs('changes')).toContain('^libs/core/src/');
    expect(runs('dispatch')).toContain('nx run @nexusdi/core:bench-dispatch');
  });
  it('runs the full suite weekly, by hand and on a core tag', () => {
    expect(wf.on.schedule).toEqual([{ cron: '0 4 * * 1' }]);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    expect(wf.on.push.tags).toEqual(['@nexusdi/core@*']);
  });
  it('splits the full run into jobs that a merge job combines for the results job', () => {
    expect(wf.jobs.merge.needs).toEqual(
      expect.arrayContaining([
        'deterministic',
        'build-meridian-8',
        'build-scale-200',
        'timings',
      ]),
    );
    expect(wf.jobs.results.needs).toBe('merge');
  });
  it('keeps no credentials in any checkout', () => {
    const checkouts = Object.values(
      wf.jobs as Record<
        string,
        { steps: Array<{ uses?: string; with?: Record<string, unknown> }> }
      >,
    ).flatMap((j) =>
      j.steps.filter((s) => s.uses?.startsWith('actions/checkout@')),
    );
    expect(checkouts.length).toBeGreaterThan(0);
    for (const c of checkouts)
      expect(c.with?.['persist-credentials']).toBe(false);
  });
  it('runs no npm ci and no repository script but the push in the job that can write', () => {
    expect(runs('results')).not.toContain('npm ci');
    expect(runs('results').trim()).toBe(
      'node benchmarks/src/open-results-pr.ts',
    );
    expect(wf.jobs.merge.permissions).toBeUndefined();
    expect(runs('merge')).toContain('build.ts --merge');
  });
  it('bounds the dispatch job in time', () => {
    expect(wf.jobs.dispatch['timeout-minutes']).toBe(45);
  });
  it('grants write access only to the jobs that need it', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(wf.jobs.results.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
    expect(wf.jobs['competitor-releases'].permissions).toEqual({
      contents: 'read',
      issues: 'write',
    });
  });
  it('sets NX_NO_CLOUD for every nx run', () => {
    expect(wf.env.NX_NO_CLOUD).toBe('true');
  });
});
