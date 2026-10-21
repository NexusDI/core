import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * The invariant: the release gate is not weaker than the pull request gate.
 *
 * The `main` job of `.github/workflows/ci.yml` runs `nx run-many` over a fixed
 * target list on every pull request. `.github/workflows/release.yml` runs the
 * same list before anything is versioned or published. A target present in CI
 * and absent from the release step means a package can be published having
 * passed less than the pull request that introduced it, and nothing goes red:
 * the release step succeeds, having run one target fewer.
 *
 * Both lists are written by hand in shell, in two files that have no reason to
 * be edited together, so they are held against each other here.
 *
 * The scope is checked as well as the targets, for the narrowings that would
 * be invisible. `release.yml` is `workflow_dispatch`, where an affected
 * comparison has the same commit on both sides: the affected set is empty,
 * every task is skipped, and the step reports success having verified
 * nothing. A release publishes every package under libs/, so a `--projects`
 * filter would leave some of them unverified. The one narrowing both gates
 * take is `--exclude=tag:demo-frontend`, which drops the federation demo
 * projects. They build with rspack, so the `demo-apps` job runs their
 * targets (demo apps spec §10.1), and the exclusion is held to private demo
 * projects here.
 *
 * In ci.yml only the `main` job is read. The `demo-apps` and `demo-growth`
 * jobs run `nx run-many` too, and they are checked below as the second gate.
 */

const workflows = join(workspaceRoot, '.github', 'workflows');

interface Step {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
}

interface Job {
  'timeout-minutes'?: number;
  'continue-on-error'?: boolean;
  needs?: string | string[];
  steps?: Step[];
}

interface Workflow {
  jobs?: Record<string, Job>;
}

function readWorkflow(file: string): Workflow {
  return parse(readFileSync(join(workflows, file), 'utf-8')) as Workflow;
}

function stepsOf(workflow: Workflow, job?: string): Step[] {
  const jobs = job
    ? [workflow.jobs?.[job] ?? {}]
    : Object.values(workflow.jobs ?? {});
  return jobs.flatMap((each) => each.steps ?? []);
}

/** The targets a `nx run-many -t ...` command names, in order. */
function targetsOf(run: string): string[] | undefined {
  // Everything from `-t` up to the first token that is not a target name: a
  // flag, a quoted expansion, or the end of the line.
  return /nx run-many\s+-t\s+((?:[a-z][a-z0-9-]*\s+)*[a-z][a-z0-9-]*)/
    .exec(run)?.[1]
    ?.split(/\s+/);
}

/**
 * The one step that runs `nx run-many` in a workflow, or in one job of it,
 * with the targets it names.
 *
 * The target list is read out of the shell script rather than out of a
 * structured field, because a workflow has nowhere else to put it. Two steps
 * running `run-many` in the scope read makes "the gate" ambiguous, so it is
 * an error here.
 */
function runManyStep(
  file: string,
  job?: string,
): { step: Step; targets: string[] } {
  const where = job ? `${file} job ${job}` : file;
  const matches = stepsOf(readWorkflow(file), job).filter((step) =>
    step.run?.includes('nx run-many'),
  );

  expect(
    matches.length,
    `${where} must have exactly one step running nx run-many`,
  ).toBe(1);

  const step = matches[0] as Step;
  const targets = targetsOf(step.run as string);

  expect(
    targets,
    `${where} runs nx run-many without a readable -t list`,
  ).toBeDefined();

  return { step, targets: targets as string[] };
}

/** Every `--exclude=` value a command passes, sorted. */
function excludesOf(run: string): string[] {
  return [...run.matchAll(/--exclude[= ](\S+)/g)]
    .flatMap((match) => (match[1] as string).split(','))
    .sort();
}

const DEMO_FRONTEND = 'tag:demo-frontend';

describe('the release verify gate', () => {
  const ci = runManyStep('ci.yml', 'main');
  const release = runManyStep('release.yml');

  it('runs every target the pull request gate runs', () => {
    expect(ci.targets.length, 'ci.yml runs no targets').toBeGreaterThan(0);

    expect(
      ci.targets.filter((target) => !release.targets.includes(target)),
      'release.yml must run these targets too',
    ).toEqual([]);
  });

  it('runs over every project, since every release publishes every package', () => {
    expect(
      release.step.run,
      'a release publishes every package under libs/',
    ).not.toMatch(/--projects|\s-p\s/);

    expect(
      release.step.run,
      'an affected comparison on workflow_dispatch resolves to nothing',
    ).not.toContain('affected');
  });

  it('excludes the demo-frontend projects in both gates and nothing else', () => {
    expect(excludesOf(ci.step.run as string)).toEqual([DEMO_FRONTEND]);
    expect(excludesOf(release.step.run as string)).toEqual([DEMO_FRONTEND]);
  });

  it('excludes only private demo projects, and keeps bridge-api and bridge-console', async () => {
    const graph = await createProjectGraphAsync({ exitOnError: false });
    const nodes = Object.values(graph.nodes);
    const excluded = nodes.filter((node) =>
      (node.data.tags ?? []).includes('demo-frontend'),
    );

    for (const node of excluded) {
      const manifest = JSON.parse(
        readFileSync(
          join(workspaceRoot, node.data.root, 'package.json'),
          'utf-8',
        ),
      ) as { private?: boolean };

      expect(
        node.data.root,
        `${node.name} is excluded from the release gate, so it must be a demo under examples/`,
      ).toMatch(/^examples\//);
      expect(
        manifest.private,
        `${node.name} is excluded from the release gate, so it must be private`,
      ).toBe(true);
      expect(
        node.data.tags,
        `${node.name} is excluded from main, so demo-apps must reach it through the demo tag`,
      ).toContain('demo');
    }

    const names = excluded.map((node) => node.name);
    expect(names).not.toContain('@nexusdi/bridge-api');
    expect(names).not.toContain('@nexusdi/bridge-console');
  });
});

/**
 * The second gate (demo apps spec §10.1): every demo app's e2e suite, on
 * every run, with no `affected` filter. The owner adds `demo-apps` to the
 * rulesets after three green runs on release/0.4, and from then on
 * release.yml requires it green on the commit it releases. `demo-growth`
 * runs the growth track's `e2e-growth` targets beside it and is never
 * required (ship systems spec section 14).
 */
describe('the demo-apps job', () => {
  const ci = readWorkflow('ci.yml');
  const job = ci.jobs?.['demo-apps'] ?? {};
  const steps = job.steps ?? [];
  const runManyIndex = (command: string) =>
    steps.findIndex((step) => step.run?.includes(command));
  const install = steps.findIndex(
    (step) =>
      step.run?.includes('playwright install') &&
      !step.run.includes('install-deps'),
  );
  const checks = runManyIndex(
    `nx run-many -t lint test typecheck --projects=${DEMO_FRONTEND}`,
  );
  const e2e = runManyIndex('nx run-many -t e2e --projects=tag:demo');

  it('exists with a 15 minute timeout', () => {
    expect(ci.jobs).toHaveProperty('demo-apps');
    expect(job['timeout-minutes']).toBe(15);
  });

  it('runs the demo-frontend checks, then every demo e2e suite, after installing Chromium', () => {
    expect(install, 'demo-apps installs Chromium').toBeGreaterThanOrEqual(0);
    expect(checks, 'demo-apps runs the demo-frontend checks').toBeGreaterThan(
      install,
    );
    expect(e2e, 'demo-apps runs the demo e2e suites').toBeGreaterThan(checks);
    expect(steps[install]?.run).toContain('chromium');
  });

  it('runs every demo on every run, with the CI runner choosing its parallelism', () => {
    for (const step of steps.filter((each) =>
      each.run?.includes('nx run-many'),
    )) {
      expect(step.run).not.toContain('--parallel');
      expect(step.run).not.toContain('affected');
      expect(step.run).not.toContain('e2e-growth');
    }
  });

  it('caches the Playwright browsers by the installed Playwright version', () => {
    const cache = steps.find((step) => step.uses?.startsWith('actions/cache@'));
    expect(cache?.with?.path).toBe('~/.cache/ms-playwright');
    expect(cache?.with?.key).toContain('playwright');
    expect(cache?.with?.key).toMatch(/\$\{\{\s*steps\.[a-z-]+\.outputs\./);
  });

  it('uses the same action pins as main, each pinned by SHA', () => {
    const pins = new Map(
      stepsOf(ci, 'main')
        .filter((step) => step.uses)
        .map((step) => {
          const [action, ref] = (step.uses as string).split('@');
          return [action, ref];
        }),
    );

    for (const step of steps.filter((each) => each.uses)) {
      const [action, ref] = (step.uses as string).split('@');
      expect(ref, `${step.uses} must be pinned by SHA`).toMatch(
        /^[0-9a-f]{40}$/,
      );
      if (pins.has(action as string)) {
        expect(ref, `${action} must use main's pin`).toBe(
          pins.get(action as string),
        );
      }
    }
  });
});

describe('the demo-growth job', () => {
  const ci = readWorkflow('ci.yml');
  const job = ci.jobs?.['demo-growth'] ?? {};

  it('runs only the e2e-growth targets of the demo projects', () => {
    expect(ci.jobs).toHaveProperty('demo-growth');
    const growth = runManyStep('ci.yml', 'demo-growth');
    expect(growth.targets).toEqual(['e2e-growth']);
    expect(growth.step.run).toContain('--projects=tag:demo');
    expect(growth.step.run).not.toContain('affected');
  });

  it('reports red when a growth case fails, since only the ruleset makes a check block', () => {
    expect(job['continue-on-error']).toBeUndefined();
    expect(job.needs).toBeUndefined();
  });

  it('pins every action by SHA', () => {
    for (const step of job.steps ?? []) {
      if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
