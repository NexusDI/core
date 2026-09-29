import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  readonly run?: string;
  readonly env?: Record<string, string>;
}
const workflow = parse(
  readFileSync(
    join(workspaceRoot, '.github/workflows/size-report.yml'),
    'utf-8',
  ),
) as {
  on: { pull_request: { types: string[] } };
  jobs: { size: { steps: Step[] } };
};
const steps = workflow.jobs.size.steps;

describe('size-report workflow', () => {
  it('runs again when the description is edited', () => {
    expect(workflow.on.pull_request.types).toEqual(
      expect.arrayContaining(['opened', 'synchronize', 'edited', 'reopened']),
    );
  });

  it('measures the head and the merge base with the same script', () => {
    const runs = steps.map((step) => step.run ?? '').join('\n');
    expect(runs).toContain('node scripts/size-report.mjs --json head.json');
    expect(runs).toContain(
      'node scripts/size-report.mjs --root ../base --json base.json',
    );
  });

  it('reads the description from the environment, never from an expression in a script', () => {
    for (const step of steps)
      expect(step.run ?? '').not.toContain('github.event.pull_request.body');
    expect(
      steps.some(
        (step) => step.env?.PR_BODY === '${{ github.event.pull_request.body }}',
      ),
    ).toBe(true);
  });
});
