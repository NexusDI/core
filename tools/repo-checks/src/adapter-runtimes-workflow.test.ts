import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  uses?: string;
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

/**
 * Spec 9.8: the bridge API's suite runs on every edge runtime the spec
 * names, on every push and pull request, so `adapter-runtimes` can be a
 * required check. The job runs no `nx run-many` (release-verify-gate holds
 * the one gate step in ci.yml's main job).
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
    const pinned = (id: string) =>
      (
        JSON.parse(
          readFileSync(
            join(workspaceRoot, 'examples/toolchain-matrix/toolchains.json'),
            'utf-8',
          ),
        ) as { toolchains: { id: string; version: string }[] }
      ).toolchains.find((t) => t.id === id)?.version;
    const setup = (action: string) =>
      job.steps.find((s) => s.uses?.startsWith(`${action}@`));
    expect(setup('denoland/setup-deno')?.with?.['deno-version']).toBe(
      pinned('deno'),
    );
    expect(setup('oven-sh/setup-bun')?.with?.['bun-version']).toBe(
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
