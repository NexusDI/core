import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * The invariant: the release gate is not weaker than the pull request gate.
 *
 * `.github/workflows/ci.yml` runs `nx run-many` over a fixed target list on
 * every pull request. `.github/workflows/release.yml` runs the same list before
 * anything is versioned or published, scoped to the release's blast radius. A
 * target present in CI and absent from the release step means a package can be
 * published having passed less than the pull request that introduced it, and
 * nothing goes red: the release step succeeds, having run one target fewer.
 *
 * Both lists are written by hand in shell, in two files that have no reason to
 * be edited together, so they are held against each other here.
 *
 * The scope is checked as well as the targets, for the one narrowing that
 * would be invisible. `release.yml` is `workflow_dispatch` on `main`, where
 * an affected comparison has the same commit on both sides: the affected set
 * is empty, every task is skipped, and the step reports success having
 * verified nothing. The release step's project list comes from the resolve
 * step that also drives `nx release`, and this asserts it stays that way.
 */

const workflows = join(workspaceRoot, '.github', 'workflows');

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Workflow {
  jobs?: Record<string, { steps?: Step[] }>;
}

function readWorkflow(file: string): Workflow {
  return parse(readFileSync(join(workflows, file), 'utf-8')) as Workflow;
}

function stepsOf(workflow: Workflow): Step[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

/**
 * The one step in a workflow that runs `nx run-many`, with the targets it names.
 *
 * The target list is read out of the shell script rather than out of a
 * structured field, because a workflow has nowhere else to put it. Two steps
 * running `run-many` in one workflow makes "the gate" ambiguous, so it is an
 * error here.
 */
function runManyStep(file: string): { step: Step; targets: string[] } {
  const matches = stepsOf(readWorkflow(file)).filter((step) =>
    step.run?.includes('nx run-many'),
  );

  expect(
    matches.length,
    `${file} must have exactly one step running nx run-many`,
  ).toBe(1);

  const step = matches[0] as Step;
  // Everything from `-t` up to the first token that is not a target name: a
  // flag, a quoted expansion, or the end of the line.
  const targets = /nx run-many\s+-t\s+((?:[a-z][a-z0-9-]*\s+)*[a-z][a-z0-9-]*)/
    .exec(step.run as string)?.[1]
    ?.split(/\s+/);

  expect(
    targets,
    `${file} runs nx run-many without a readable -t list`,
  ).toBeDefined();

  return { step, targets: targets as string[] };
}

describe('the release verify gate', () => {
  const ci = runManyStep('ci.yml');
  const release = runManyStep('release.yml');

  it('runs every target the pull request gate runs', () => {
    expect(ci.targets.length, 'ci.yml runs no targets').toBeGreaterThan(0);

    expect(
      ci.targets.filter((target) => !release.targets.includes(target)),
      'release.yml must run these targets too',
    ).toEqual([]);
  });

  it('scopes itself to the projects the same run releases', () => {
    expect(release.step.run).toContain('--projects');

    // The resolve step owns the release set. Reading its output is what keeps
    // the set that is verified in step with the set that is versioned and
    // published.
    expect(Object.values(release.step.env ?? {}).join('\n')).toContain(
      'steps.projects.outputs.',
    );

    expect(
      release.step.run,
      'an affected comparison on workflow_dispatch resolves to nothing',
    ).not.toContain('affected');
  });
});
