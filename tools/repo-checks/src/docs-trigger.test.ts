import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { checkTrigger, covers } from './docs/docs-trigger';
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
      "docs.yml: on.push.tags is set. GitHub Pages' default environment protection rule allows only the default branch, so a tag-triggered run fails at the deploy job; release.yml dispatches docs.yml on main instead, after a successful publish.",
      'docs.yml: on.workflow_dispatch is missing. A person must be able to redeploy by hand.',
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
      .map((name) => graph.nodes[name]!.data.root)
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
