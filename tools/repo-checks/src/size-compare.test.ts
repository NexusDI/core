import { workspaceRoot } from '@nx/devkit';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type Sizes = {
  core: number | null;
  packages: Record<string, number | null>;
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
});
