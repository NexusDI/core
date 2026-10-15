import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  checkMeta,
  checkQueries,
  compileFailures,
  contentFences,
  markdownFences,
  twoslashFences,
} from './docs/doc-twoslash';
import { loadTwoslashPrelude } from './docs/loaders';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

/**
 * Nextra compiles every `twoslash` fence during `next build`, and a type error
 * in one fails that build. This runs the same compile in `nx test`, under the
 * prelude the loader chain gives the build, because the build is slow and runs
 * late.
 *
 * Twoslash throws on an error a fence produces and `// @errors:` does not
 * name. It says nothing when a named error stops occurring, so a fence that
 * asserts a type failure can decay into a fence that asserts nothing. The
 * compile rule here checks the other direction too.
 *
 * The same compile runs over every doctested fence in a package's
 * `README.md` and `docs/*.md`. The package's test run executes those fences
 * and never type-checks them.
 */

const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-twoslash', name, 'content'));

// Twoslash builds a TypeScript environment on each first compile, which takes
// seconds when the run shares the machine with other projects' tests.
const COMPILE = { timeout: 30_000 };

describe('doc-twoslash fixtures', COMPILE, () => {
  it('passes a clean tree', async () => {
    const withPrelude = await loadTwoslashPrelude();
    const fences = twoslashFences(tree('clean'));

    expect(fences).toHaveLength(3);
    expect(checkMeta(fences)).toEqual([]);
    expect(checkQueries(fences)).toEqual([]);
    expect(compileFailures(fences, withPrelude)).toEqual([]);
  });

  it('fails a fence meta Nextra gives no Popup import', () => {
    expect(checkMeta(twoslashFences(tree('sabotaged')))).toEqual([
      "tools/repo-checks/src/__fixtures__/docs/doc-twoslash/sabotaged/content/tokens.mdx:8: the fence meta is 'twoslash copy'. Nextra imports Popup only for a meta of exactly 'twoslash', and MDX throws on the missing component. Drop the other words.",
    ]);
  });

  it('fails a query above the last line of its fence', () => {
    expect(checkQueries(twoslashFences(tree('sabotaged')))).toEqual([
      'tools/repo-checks/src/__fixtures__/docs/doc-twoslash/sabotaged/content/tokens.mdx:12: a ^? query sits above the last line, and its popup covers the line below it. End the fence on its one query.',
    ]);
  });

  it('fails a declared error that no longer occurs, and an undeclared one', async () => {
    const withPrelude = await loadTwoslashPrelude();
    const failures = compileFailures(
      twoslashFences(tree('sabotaged')),
      withPrelude,
    );

    expect(failures).toEqual([
      'tools/repo-checks/src/__fixtures__/docs/doc-twoslash/sabotaged/content/tokens.mdx:18: declares @errors: 2322, which the compiler no longer reports. Remove the code, or restore the error it names.',
      expect.stringMatching(
        /^tools\/repo-checks\/src\/__fixtures__\/docs\/doc-twoslash\/sabotaged\/content\/tokens\.mdx:23: does not compile: .*2322/s,
      ),
    ]);
  });
});

describe('doc-twoslash on apps/docs', COMPILE, () => {
  // Every page expanded once: the reference pages run the reference loader
  // over each entry, which under a parallel gate outlasts the default 30
  // seconds per test.
  let fences: Awaited<ReturnType<typeof contentFences>>;
  beforeAll(async () => {
    fences = await contentFences(CONTENT, workspaceRoot);
  }, 180_000);

  it('finds the fences', () => {
    // The reference pages emit a signature and an example fence per entry,
    // so an empty list means the expansion stopped reaching this guard.
    expect(fences.length).toBeGreaterThan(0);
  });

  it('holds the meta and query rules on every expanded page', () => {
    expect(checkMeta(fences)).toEqual([]);
    expect(checkQueries(fences)).toEqual([]);
  });

  it('compiles every expanded twoslash fence', async () => {
    const withPrelude = await loadTwoslashPrelude();

    expect(compileFailures(fences, withPrelude)).toEqual([]);
    // Every reference page's signature and example fences compile here, and
    // `/api/` alone holds 90 entries; under a parallel gate that outlasts
    // the default 30 seconds.
  }, 180_000);
});

// Read once at collection, so `it.each` below has one case per package.
const packageFiles = await markdownFences(workspaceRoot);

describe('doc-twoslash on the package markdown', COMPILE, () => {
  it('finds a doctested fence in more than one package, and one under docs/', () => {
    const files = packageFiles;
    const packages = new Set(
      files.filter(({ fences }) => fences.length > 0).map(({ root }) => root),
    );

    expect(packages.size).toBeGreaterThan(1);
    expect(
      files.some(
        ({ file, fences }) => file.includes('/docs/') && fences.length > 0,
      ),
    ).toBe(true);
  });

  it.each([...new Set(packageFiles.map(({ root }) => root))].sort())(
    'compiles every doctested fence of %s',
    async (root) => {
      const withPrelude = await loadTwoslashPrelude();
      const failures = packageFiles
        .filter((each) => each.root === root)
        .flatMap(({ dir, fences }) =>
          compileFailures(fences, withPrelude, dir),
        );

      expect(failures).toEqual([]);
    },
  );
});
