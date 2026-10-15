import { workspaceRoot } from '@nx/devkit';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type Sizes = {
  core: number | null;
  packages: Record<string, number | null>;
  standalone?: Record<string, number | null>;
  overBudget?: {
    name: string;
    label: string;
    size: number;
    budget: number;
    reason: string;
  }[];
};
const { compareSizes } = (await import(
  pathToFileURL(join(workspaceRoot, 'scripts', 'size-compare.mjs')).href
)) as {
  compareSizes(
    base: Sizes,
    head: Sizes,
    body: string,
    threshold: number,
  ): { markdown: string; fail: boolean };
};

const base: Sizes = { core: 10_000, packages: { errors: 3000 } };

describe('compareSizes', () => {
  it('passes growth at or under the threshold', () => {
    const result = compareSizes(
      base,
      { core: 10_200, packages: { errors: 3000 } },
      '',
      2,
    );
    expect(result.fail).toBe(false);
    expect(result.markdown).toContain(
      '| core | 10000 | 10200 | +200 | +2.00% |',
    );
  });

  it('fails growth over the threshold without a Size section', () => {
    const head = { core: 10_300, packages: { errors: 3000 } };
    expect(compareSizes(base, head, 'Adds a hook.', 2).fail).toBe(true);
    expect(
      compareSizes(base, head, 'Adds a hook.\n\n## Size\nThe hook...', 2).fail,
    ).toBe(false);
  });

  it('reports package growth and never fails on it', () => {
    const result = compareSizes(
      base,
      { core: 10_000, packages: { errors: 9000, node: 400 } },
      '',
      2,
    );
    expect(result.fail).toBe(false);
    expect(result.markdown).toContain('| @nexusdi/errors | 3000 | 9000 |');
    expect(result.markdown).toContain('| @nexusdi/node | new | 400 |');
  });

  it('starts the comment with the marker the workflow finds it by', () => {
    expect(
      compareSizes(base, base, '', 2).markdown.startsWith(
        '<!-- nexusdi-size-report -->',
      ),
    ).toBe(true);
  });

  it('passes and reports no figure when the merge base does not build the fixture', () => {
    // The first 0.4 pull request's merge base is core 0.3.1, whose API
    // predates the fixture (R22). Nothing to compare against, so the job
    // never fails on it, no matter how large core's head figure is.
    const noBase: Sizes = { core: null, packages: { errors: null } };
    const result = compareSizes(
      noBase,
      { core: 50_000, packages: { errors: 9000 } },
      '',
      2,
    );
    expect(result.fail).toBe(false);
    expect(result.markdown).toContain('| core | no figure | 50000 | | |');
    expect(result.markdown).toContain(
      '| @nexusdi/errors | no figure | 9000 | | |',
    );
  });

  it('fails when the pull request itself has no figure for core, no matter what the base measures', () => {
    // A pull request that breaks the fixture's own build (renames or drops
    // an export examples/size/src/core.ts imports) must fail loudly, not
    // read as core shrinking to nothing (base 17620, head null used to
    // coerce to a -100% "growth" that always passed).
    const head: Sizes = { core: null, packages: { errors: null } };
    const result = compareSizes(
      { core: 17_620, packages: { errors: 4336 } },
      head,
      '## Size\nThis explains growth, but there is none to explain.',
      2,
    );
    expect(result.fail).toBe(true);
    expect(result.markdown).not.toContain('null');
    expect(result.markdown).toContain('| core | 17620 | no figure | | |');
  });

  const over = {
    name: 'hono',
    label: '@nexusdi/hono',
    size: 2600,
    budget: 2500,
    reason: 'the middleware',
  };
  const head: Sizes = {
    core: 10_000,
    packages: { errors: 3000, hono: 2600 },
    standalone: { 'hono-worker': 28_500 },
    overBudget: [over],
  };
  const withWorker = { ...base, standalone: { 'hono-worker': 28_000 } };

  it('lists a standalone bundle and an adapter over its budget, and fails without a Size section', () => {
    const result = compareSizes(withWorker, head, '', 2);
    expect(result.fail).toBe(true);
    expect(result.markdown).toContain(
      '| hono-worker (whole bundle) | 28000 | 28500 | +500 | +1.79% |',
    );
    expect(result.markdown).toContain(
      '- @nexusdi/hono is 2600 bytes, over its 2500-byte budget (the middleware)',
    );
  });

  it('passes an adapter over its budget when the Size section names it', () => {
    const body =
      '## Size\n\n@nexusdi/hono grows 100 bytes: the request signal now disposes the scope on an abort.';
    expect(compareSizes(withWorker, head, body, 2).fail).toBe(false);
  });

  it('fails an adapter over its budget when the Size section names another', () => {
    const body =
      '## Size\n\n@nexusdi/express grows for its new option.\n\n## Notes\n\n@nexusdi/hono too.';
    expect(compareSizes(withWorker, head, body, 2).fail).toBe(true);
  });
});
