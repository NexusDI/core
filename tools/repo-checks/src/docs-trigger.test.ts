import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { checkNextTrigger, checkTrigger, covers } from './docs/docs-trigger';
import { FIXTURES } from './docs/paths';

const read = (name: string) =>
  parse(readFileSync(join(FIXTURES, 'docs-trigger', name), 'utf8')) as unknown;
const ROOTS = [
  'libs/core',
  'internal/meridian-ui',
  'tools/doc-examples',
  'examples/meridian',
];

describe('docs-trigger fixtures', () => {
  it('matches a root against a /** glob and an exact path', () => {
    expect(covers(['libs/**'], 'libs/core')).toBe(true);
    expect(covers(['package.json'], 'package.json')).toBe(true);
    expect(covers(['libs/**'], 'internal/meridian-ui')).toBe(false);
  });

  it('passes a workflow whose filter covers every input', () => {
    expect(checkTrigger(read('clean.yml'), ROOTS)).toEqual([]);
  });

  it('fails a missing path, a stray tag trigger, no manual run and an uncovered root', () => {
    expect(checkTrigger(read('sabotaged.yml'), ROOTS)).toEqual([
      "docs.yml: on.push.paths does not cover 'internal/meridian-ui', a project the site builds from. A change there would deploy nothing.",
      "docs.yml: on.push.paths lacks 'internal/**' (spec section 15.3).",
      "docs.yml: on.push.tags is set. GitHub Pages' default environment protection rule allows only the default branch, so a tag-triggered run fails at the deploy job. release.yml dispatches docs.yml on main after a successful publish.",
      'docs.yml: on.workflow_dispatch is missing. A person must be able to redeploy by hand.',
    ]);
  });
});

const DOCS_PATHS = (read('clean.yml') as { on: { push: { paths: string[] } } })
  .on.push.paths;

describe('docs-next trigger fixtures', () => {
  it('passes a workflow that only dispatches docs.yml on main', () => {
    expect(checkNextTrigger(read('next-clean.yml'), DOCS_PATHS)).toEqual([]);
  });

  it('fails extra branches, events, paths, permissions and steps', () => {
    expect(checkNextTrigger(read('next-sabotaged.yml'), DOCS_PATHS)).toEqual([
      "docs-next.yml: jobs.dispatch runs a step other than 'gh workflow run docs.yml --ref main'. The job holds actions: write, so it runs nothing else.",
      'docs-next.yml: jobs.dispatch sets its own permissions. The workflow grants actions: write at the top level and nothing else.',
      'docs-next.yml: jobs.dispatch uses actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1. The dispatch needs no checkout and no action.',
      "docs-next.yml: no step runs 'gh workflow run docs.yml --ref main'.",
      "docs-next.yml: on.push.branches must be exactly ['release/**']; found ['release/**', 'main'].",
      "docs-next.yml: on.push.paths lacks 'internal/**', which docs.yml lists. A change there on a release branch would leave /next/ stale.",
      "docs-next.yml: on.push.paths lists 'README.md', which docs.yml does not. The two lists are the same.",
      'docs-next.yml: on.workflow_dispatch is set. The workflow runs on release branch pushes only.',
      'docs-next.yml: permissions must be exactly { actions: write }; found { actions: write, contents: write }.',
    ]);
  });

  it('fails a workflow with no dispatch step', () => {
    const workflow = read('next-clean.yml') as {
      jobs: { dispatch: { steps: unknown[] } };
    };
    workflow.jobs.dispatch.steps = [];
    expect(checkNextTrigger(workflow, DOCS_PATHS)).toEqual([
      "docs-next.yml: no step runs 'gh workflow run docs.yml --ref main'.",
    ]);
  });
});

describe('docs-trigger on .github/workflows/docs.yml', () => {
  it('covers every released project and every project the site builds from', async () => {
    const graph = await createProjectGraphAsync({ exitOnError: false });
    const released = Object.values(graph.nodes)
      .filter((node) => node.data.root.startsWith('libs/'))
      .map((node) => node.name);
    const docsDeps = (graph.dependencies['@nexusdi/docs'] ?? [])
      .map((dependency) => dependency.target)
      .filter((name) => name in graph.nodes);
    const roots = [...new Set([...released, ...docsDeps])]
      .map((name) => {
        const node = graph.nodes[name];
        if (node === undefined)
          throw new Error(`no project graph node ${name}`);
        return node.data.root;
      })
      .sort();

    const workflow = parse(
      readFileSync(join(workspaceRoot, '.github/workflows/docs.yml'), 'utf8'),
    );

    expect(
      checkTrigger(workflow, roots),
      'Add each missing path to on.push.paths in .github/workflows/docs.yml.',
    ).toEqual([]);
  });
});

describe('docs-trigger on .github/workflows/docs-next.yml', () => {
  it('dispatches docs.yml on main for every path docs.yml watches', () => {
    const load = (name: string) =>
      parse(
        readFileSync(join(workspaceRoot, '.github/workflows', name), 'utf8'),
      ) as unknown;
    const docs = load('docs.yml') as { on: { push: { paths: string[] } } };

    expect(checkNextTrigger(load('docs-next.yml'), docs.on.push.paths)).toEqual(
      [],
    );
  });
});
