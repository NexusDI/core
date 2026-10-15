import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly 'continue-on-error'?: unknown;
}
interface Job {
  readonly 'runs-on': string;
  readonly permissions: Record<string, string>;
  readonly steps: readonly Step[];
  readonly 'continue-on-error'?: unknown;
}

const wf = parse(
  readFileSync(
    join(workspaceRoot, '.github/workflows/devtools-trace-canary.yml'),
    'utf-8',
  ),
) as {
  on: Record<string, unknown> & {
    pull_request: { paths: string[] };
    schedule: unknown[];
  };
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
};
const jobs = Object.values(wf.jobs);
const runs = jobs.flatMap((j) => j.steps.map((s) => s.run ?? '')).join('\n');

// The canary checks the Chrome layout of the profiler's trace file against
// a real Chrome (startup profiler spec 10.2, owner item (c) 3). It is never
// a required check.
describe('devtools trace canary workflow', () => {
  it('runs weekly, by hand and on pull requests that touch the profile source', () => {
    expect(wf.on.schedule).toHaveLength(1);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    expect(wf.on.pull_request.paths).toEqual(['libs/devtools/src/profile/**']);
  });

  it('has one ubuntu-24.04 job with read access to the code and write access to issues', () => {
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.['runs-on']).toBe('ubuntu-24.04');
    expect(wf.permissions).toEqual({});
    expect(jobs[0]?.permissions).toEqual({
      contents: 'read',
      issues: 'write',
    });
  });

  it('pins every action by SHA and lets no step fail quietly', () => {
    for (const job of jobs) {
      expect(job['continue-on-error']).toBeUndefined();
      for (const step of job.steps) {
        if (step.uses !== undefined)
          expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
        expect(step['continue-on-error']).toBeUndefined();
      }
    }
  });

  it('runs the canary on Chrome stable and beta through a pinned installer, and the trace tests on the latest engine', () => {
    expect(runs.match(/@puppeteer\/browsers@\S+/g)).toEqual([
      '@puppeteer/browsers@3.2.3',
      '@puppeteer/browsers@3.2.3',
    ]);
    expect(runs).toContain('chrome@stable');
    expect(runs).toContain('chrome@beta');
    expect(runs.match(/node tools\/trace-canary\/run\.mjs/g)).toHaveLength(2);
    expect(runs).toContain('@paulirish/trace_engine@latest');
    expect(runs).toContain('nx run @nexusdi/devtools:test-trace');
  });

  it('opens or updates one issue only when a scheduled run fails', () => {
    const report = jobs[0]?.steps.find((s) => s.run?.includes('gh issue'));
    expect(report?.if).toBe("failure() && github.event_name == 'schedule'");
  });
});
