import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  strategy?: { 'fail-fast'?: boolean; matrix?: { leg?: string[] } };
  steps: Step[];
}

const ci = parse(
  readFileSync(join(workspaceRoot, '.github/workflows/ci.yml'), 'utf-8'),
) as { on: Record<string, unknown>; jobs: Record<string, Job> };

/** The version examples/toolchain-matrix/toolchains.json pins for `id`. */
const pinned = (id: string) =>
  (
    JSON.parse(
      readFileSync(
        join(workspaceRoot, 'examples/toolchain-matrix/toolchains.json'),
        'utf-8',
      ),
    ) as { toolchains: { id: string; version: string }[] }
  ).toolchains.find((t) => t.id === id)?.version;

/** The step of `job` that runs `action`, at any ref. */
const setup = (job: Job, action: string) =>
  job.steps.find((s) => s.uses?.startsWith(`${action}@`));

/**
 * Spec 9.8: the bridge API's suite runs on every edge runtime the spec
 * names, on every push and pull request, so `adapter-runtimes` can be a
 * required check. The job runs no `nx run-many` (release-verify-gate holds
 * the gate steps in ci.yml's main-build and main-test jobs).
 */
describe('adapter-runtimes job', () => {
  const job = ci.jobs['adapter-runtimes'];

  it('exists and keeps every leg running when one fails', () => {
    expect(job).toBeDefined();
    expect(job.strategy?.['fail-fast']).toBe(false);
  });

  it('runs the workerd leg', () => {
    expect(job.strategy?.matrix?.leg).toContain('workerd');
    const runs = job.steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('nx run @nexusdi/bridge-api:test-workers');
  });

  it('runs Deno, Bun and edge-runtime legs, at the versions toolchains.json pins', () => {
    expect(job.strategy?.matrix?.leg).toEqual([
      'workerd',
      'deno',
      'bun',
      'edge-runtime',
    ]);
    const runs = job.steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('nx run @nexusdi/bridge-api:runtime-leg --leg=deno');
    expect(runs).toContain('nx run @nexusdi/bridge-api:runtime-leg --leg=bun');
    expect(runs).toContain('nx run @nexusdi/bridge-api:test-edge');
    expect(setup(job, 'denoland/setup-deno')?.with?.['deno-version']).toBe(
      pinned('deno'),
    );
    expect(setup(job, 'oven-sh/setup-bun')?.with?.['bun-version']).toBe(
      pinned('bun'),
    );
  });

  it('runs on every push and pull request, with no path filter', () => {
    for (const event of ['push', 'pull_request']) {
      expect(ci.on).toHaveProperty(event);
      const filter = (ci.on[event] ?? {}) as Record<string, unknown>;
      expect(filter).not.toHaveProperty('paths');
      expect(filter).not.toHaveProperty('paths-ignore');
    }
  });

  it('pins every action by SHA and runs no nx run-many', () => {
    for (const step of job.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
      expect(step.run ?? '').not.toContain('nx run-many');
    }
  });
});

/**
 * Ship systems spec section 14: the growth target runs the simulation on
 * Deno and Bun too, so the non-required demo-growth job installs the same
 * runtimes the adapter-runtimes legs run, from the same action pins.
 */
describe('demo-growth job', () => {
  const job = ci.jobs['demo-growth'];
  const legs = ci.jobs['adapter-runtimes'];

  it.each([
    ['denoland/setup-deno', 'deno-version', 'deno'],
    ['oven-sh/setup-bun', 'bun-version', 'bun'],
  ])(
    'installs %s with the pin adapter-runtimes uses and the version toolchains.json pins, before e2e-growth',
    (action, input, id) => {
      const step = setup(job, action);
      expect(step?.uses).toBe(setup(legs, action)?.uses);
      expect(step?.with?.[input]).toBe(pinned(id));
      expect(step?.if).toBeUndefined();
      const growth = job.steps.findIndex((s) =>
        s.run?.includes('-t e2e-growth'),
      );
      expect(growth).toBeGreaterThan(-1);
      expect(job.steps.indexOf(step as Step)).toBeLessThan(growth);
    },
  );
});
