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
  readonly 'timeout-minutes'?: number;
  readonly needs?: string;
  readonly if?: string;
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
const runs = (job: string) =>
  (wf.jobs[job]?.steps ?? []).map((s) => s.run ?? '').join('\n');

// The canary checks the Chrome layout of the profiler's trace file against
// a real Chrome (startup profiler spec 10.2, owner item (c) 3). It is never
// a required check.
describe('devtools trace canary workflow', () => {
  it('runs weekly, by hand and on pull requests that touch the profile source or the canary', () => {
    expect(wf.on.schedule).toHaveLength(1);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    expect(wf.on.pull_request.paths).toEqual([
      'libs/devtools/src/profile/**',
      'tools/trace-canary/**',
      '.github/workflows/devtools-trace-canary.yml',
    ]);
  });

  it('runs the canary on ubuntu-24.04 for at most 15 minutes, reading the code only', () => {
    expect(wf.permissions).toEqual({});
    expect(wf.jobs['canary']?.['runs-on']).toBe('ubuntu-24.04');
    expect(wf.jobs['canary']?.['timeout-minutes']).toBe(15);
    expect(wf.jobs['canary']?.permissions).toEqual({ contents: 'read' });
  });

  it('reports a failed scheduled run in its own job that can only write issues', () => {
    expect(Object.keys(wf.jobs)).toEqual(['canary', 'report']);
    const report = wf.jobs['report'];
    expect(report?.needs).toBe('canary');
    expect(report?.if).toBe("failure() && github.event_name == 'schedule'");
    expect(report?.permissions).toEqual({ issues: 'write' });
    expect(runs('report')).toContain('gh issue');
    expect(runs('canary')).not.toContain('gh issue');
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
    expect(runs('canary').match(/@puppeteer\/browsers@\S+/g)).toEqual([
      '@puppeteer/browsers@3.2.3',
      '@puppeteer/browsers@3.2.3',
    ]);
    const canary = runs('canary');
    expect(canary).toContain('chrome@stable');
    expect(canary).toContain('chrome@beta');
    expect(canary.match(/node tools\/trace-canary\/run\.mjs/g)).toHaveLength(2);
    expect(canary).toContain('@paulirish/trace_engine@latest');
    expect(canary).toContain('nx run @nexusdi/devtools:test-trace');
  });
});
