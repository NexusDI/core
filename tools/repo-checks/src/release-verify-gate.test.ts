import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * The invariant: the release gate is not weaker than the pull request gate.
 *
 * The gate jobs of `.github/workflows/ci.yml` run `nx run-many` over a fixed
 * target list on every pull request. The gate runs in two jobs on two
 * runners, `main-build` and `main-test`, and the `main` job reports their
 * result under the check name the rulesets require. `.github/workflows/release.yml` runs the
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
 * targets (demo apps spec §10.1), and a test below holds the exclusion to
 * private demo projects.
 *
 * This file reads the jobs `main` needs as the gate. The `demo-apps` and
 * `demo-growth` jobs run `nx run-many` too, and the tests below check them
 * as the second gate.
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

/** The jobs whose result ci.yml's `main` check reports. */
function gateJobs(): string[] {
  const needs = readWorkflow('ci.yml').jobs?.main?.needs;
  return typeof needs === 'string' ? [needs] : (needs ?? []);
}

/**
 * The gate's run-many step in each gate job, and the targets the gate runs
 * across all of them.
 */
function ciGate(): {
  steps: { job: string; step: Step; targets: string[] }[];
  targets: string[];
} {
  const steps = gateJobs().map((job) => ({
    job,
    ...runManyStep('ci.yml', job),
  }));
  return {
    steps,
    targets: [...new Set(steps.flatMap((each) => each.targets))],
  };
}

describe('the release verify gate', () => {
  const ci = ciGate();
  const release = runManyStep('release.yml');

  it('reports the gate jobs under the main check, red when one is not green', () => {
    const main = readWorkflow('ci.yml').jobs?.main as Job & { if?: string };
    expect(gateJobs()).toEqual(['main-build', 'main-test']);
    expect(main.if, 'main runs after a red gate job too').toBe('always()');
    const check = (main.steps ?? []).map((step) => step.run ?? '').join('\n');
    expect(check).toContain('all(.[]; .result == "success")');
  });

  /**
   * Nx runs `--parallel` tasks at once and each vitest run starts
   * VITEST_MAX_WORKERS workers, so their product is how many test workers
   * share the runner. Past its 4 vCPUs the workers starve each other, and
   * a 100 ms test reaches vitest's 5 s timeout (#141).
   */
  it('holds main-test to one test worker per vCPU of the runner', () => {
    const { step } = runManyStep('ci.yml', 'main-test');
    const parallel = Number(/--parallel=(\d+)/.exec(step.run ?? '')?.[1]);
    const workers = Number(step.env?.VITEST_MAX_WORKERS);
    expect(parallel, 'main-test sets --parallel').toBeGreaterThan(0);
    expect(workers, 'main-test sets VITEST_MAX_WORKERS').toBeGreaterThan(0);
    expect(parallel * workers).toBeLessThanOrEqual(4);
  });

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
    for (const { job, step } of ci.steps) {
      expect(excludesOf(step.run as string), job).toEqual([DEMO_FRONTEND]);
    }
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
    }

    const names = excluded.map((node) => node.name);
    for (const name of ['@nexusdi/bridge-api', '@nexusdi/bridge-console']) {
      const node = nodes.find((each) => each.name === name);
      expect(node, `${name} is a project`).toBeDefined();
      expect(
        node?.data.tags,
        `${name} runs its e2e suite in demo-apps`,
      ).toContain('demo');
      expect(names, `${name} stays in main and the release gate`).not.toContain(
        name,
      );
    }
  });

  /**
   * main and the release gate leave out every demo-frontend project, so
   * demo-apps must run each target of main's list that such a project has.
   * This asks Nx for the task graph of every `nx run-many` step in
   * demo-apps and looks for each of those tasks in it. A project's build
   * may come in as a dependency of a demo's e2e, and the graph shows that.
   */
  it('runs every main target of every excluded project in demo-apps', async () => {
    const graph = await createProjectGraphAsync({ exitOnError: false });
    const expected = Object.values(graph.nodes)
      .filter((node) => (node.data.tags ?? []).includes('demo-frontend'))
      .flatMap((node) =>
        ci.targets
          .filter((target) => target in (node.data.targets ?? {}))
          .map((target) => `${node.name}:${target}`),
      );

    const runs = stepsOf(readWorkflow('ci.yml'), 'demo-apps')
      .map((step) => step.run ?? '')
      .filter((run) => run.includes('nx run-many'));
    expect(runs.length, 'demo-apps runs nx run-many').toBeGreaterThan(0);

    const tasks = new Set(
      runs.flatMap((run) => {
        expect(run, 'each demo-apps step runs nx through npx').toMatch(
          /^npx nx run-many /,
        );
        const out = execFileSync(
          join(workspaceRoot, 'node_modules', '.bin', 'nx'),
          [
            ...run
              .replace(/^npx nx /, '')
              .trim()
              .split(/\s+/),
            '--graph=stdout',
          ],
          {
            cwd: workspaceRoot,
            encoding: 'utf-8',
            env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true' },
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
          },
        );
        return Object.keys(
          (
            JSON.parse(out.slice(out.indexOf('{'))) as {
              tasks: { tasks: Record<string, unknown> };
            }
          ).tasks.tasks,
        );
      }),
    );

    expect(
      expected.filter((task) => !tasks.has(task)),
      'main leaves these tasks out and demo-apps does not run them',
    ).toEqual([]);
  }, 120_000);
});

/**
 * The Playwright steps of a job: the browsers cached by the installed
 * Playwright version, a full install on a cache miss, and the system
 * libraries alone on a hit (they live outside the cached folder). Returns
 * the index of the last of them, which every e2e step must follow.
 */
function playwrightSetup(steps: Step[], job: string): number {
  const cacheIndex = steps.findIndex((step) =>
    step.uses?.startsWith('actions/cache@'),
  );
  const cache = steps[cacheIndex] as Step & { id?: string };
  expect(cache, `${job} caches the Playwright browsers`).toBeDefined();
  expect(cache.with?.path).toBe('~/.cache/ms-playwright');
  expect(cache.with?.key).toContain('playwright');
  const [, versionStep, versionOutput] =
    /\$\{\{\s*steps\.([a-z-]+)\.outputs\.([a-z-]+)\s*\}\}/.exec(
      cache.with?.key ?? '',
    ) ?? [];
  const version = steps.find(
    (step) => (step as Step & { id?: string }).id === versionStep,
  );
  expect(
    version?.run,
    `${job} keys the cache by the installed Playwright version`,
  ).toContain('playwright-core/package.json');
  expect(version?.run).toContain(`${versionOutput}=`);
  expect(version?.run).toContain('$GITHUB_OUTPUT');

  const hit = `steps.${cache.id}.outputs.cache-hit`;
  const install = steps.findIndex((step) =>
    step.run?.includes('playwright install --with-deps chromium'),
  );
  const deps = steps.findIndex((step) =>
    step.run?.includes('playwright install-deps chromium'),
  );

  expect(install, `${job} installs Chromium on a miss`).toBeGreaterThan(
    cacheIndex,
  );
  expect(steps[install]?.if).toBe(`${hit} != 'true'`);
  expect(deps, `${job} installs the system libraries on a hit`).toBeGreaterThan(
    cacheIndex,
  );
  expect(steps[deps]?.if).toBe(`${hit} == 'true'`);

  return Math.max(install, deps);
}

/** Every action pinned by SHA, and by main's SHA where main uses it too. */
function expectMainPins(ci: Workflow, steps: Step[]): void {
  const pins = new Map(
    gateJobs()
      .flatMap((job) => stepsOf(ci, job))
      .filter((step) => step.uses)
      .map((step) => (step.uses as string).split('@') as [string, string]),
  );

  for (const step of steps.filter((each) => each.uses)) {
    const [action, ref] = (step.uses as string).split('@') as [string, string];
    expect(ref, `${step.uses} must be pinned by SHA`).toMatch(/^[0-9a-f]{40}$/);
    if (pins.has(action)) {
      expect(ref, `${action} must use main's pin`).toBe(pins.get(action));
    }
  }
}

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
  const checks = runManyIndex(
    `nx run-many -t lint test build typecheck --projects=${DEMO_FRONTEND}`,
  );
  const e2e = runManyIndex('nx run-many -t e2e --projects=tag:demo');

  it('exists with a 15 minute timeout', () => {
    expect(ci.jobs).toHaveProperty('demo-apps');
    expect(job['timeout-minutes']).toBe(15);
  });

  it('runs the demo-frontend checks, then every demo e2e suite, after installing Chromium', () => {
    const installed = playwrightSetup(steps, 'demo-apps');
    expect(checks, 'demo-apps runs the demo-frontend checks').toBeGreaterThan(
      installed,
    );
    expect(e2e, 'demo-apps runs the demo e2e suites').toBeGreaterThan(checks);
  });

  it('runs every demo on every run, with the CI runner choosing its parallelism', () => {
    const runMany = steps.filter((each) => each.run?.includes('nx run-many'));
    expect(runMany.length).toBe(2);
    for (const step of runMany) {
      expect(step.run).not.toContain('--parallel');
      expect(step.run).not.toContain('affected');
      expect(step.run).not.toContain('e2e-growth');
    }
  });

  it('uses the same action pins as main, each pinned by SHA', () => {
    expectMainPins(ci, steps);
  });
});

describe('the demo-growth job', () => {
  const ci = readWorkflow('ci.yml');
  const job = ci.jobs?.['demo-growth'] ?? {};
  const steps = job.steps ?? [];

  it('exists with a 20 minute timeout', () => {
    expect(ci.jobs).toHaveProperty('demo-growth');
    expect(job['timeout-minutes']).toBe(20);
  });

  it('runs only the e2e-growth targets of the demo projects, after installing Chromium', () => {
    const growth = runManyStep('ci.yml', 'demo-growth');
    expect(growth.targets).toEqual(['e2e-growth']);
    expect(growth.step.run).toContain('--projects=tag:demo');
    expect(growth.step.run).not.toContain('affected');
    expect(
      steps.findIndex((step) => step.run === growth.step.run),
    ).toBeGreaterThan(playwrightSetup(steps, 'demo-growth'));
  });

  it('reports red when a growth case fails, since only the ruleset makes a check block', () => {
    expect(job['continue-on-error']).toBeUndefined();
    expect(job.needs).toBeUndefined();
  });

  it('uses the same action pins as main, each pinned by SHA', () => {
    expectMainPins(ci, steps);
  });
});
