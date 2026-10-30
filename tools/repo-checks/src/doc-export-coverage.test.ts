import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readPackageExports } from '@nexusdi/doc-examples/package-exports';
import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  checkExportCoverage,
  type CoverageInput,
} from './docs/doc-export-coverage';
import { loadLibraries } from './docs/loaders';
import { FIXTURES } from './docs/paths';
import { ERROR_EXEMPT, readReferenceSite } from './docs/reference-site';
import { parsePage, readSite, type DocsPage } from './docs/site';

/**
 * G10: every export has an entry on its package's reference page, and every
 * callable one is called in a fence that runs.
 *
 * Ported from `Evanion/libraries` `tools/repo-checks/src/doc-export-coverage.test.ts`
 * at 92320250. The page is found by its `package` frontmatter, and each
 * library has exactly one.
 */

const tree = (name: string): DocsPage[] =>
  readSite(join(FIXTURES, 'doc-export-coverage', name, 'content'));

const X = {
  name: '@nexusdi/x',
  entries: new Map([
    [
      '@nexusdi/x',
      [
        { name: 'make', callable: true, typeOnly: false, error: false },
        { name: 'Shape', callable: false, typeOnly: true, error: false },
      ],
    ],
  ]),
};

const ALLOWANCE = join(
  import.meta.dirname,
  'doc-export-coverage-allowance.json',
);

/** The real input: the site's pages, every library's exports and the allowance. */
async function workspaceInput(): Promise<CoverageInput> {
  const pages = await readReferenceSite();
  const packages = (await loadLibraries())(workspaceRoot).map((library) => ({
    name: library.name,
    entries: readPackageExports(
      join(workspaceRoot, library.root, 'package.json'),
    ),
  }));

  return {
    pages,
    packages,
    exempt: ERROR_EXEMPT,
    allowance: JSON.parse(readFileSync(ALLOWANCE, 'utf8')) as Record<
      string,
      { unexercised: string[] }
    >,
  };
}

describe('checkExportCoverage', () => {
  it('passes a clean tree', () => {
    expect(
      checkExportCoverage({
        pages: tree('clean'),
        packages: [X],
        exempt: new Map(),
        allowance: {},
      }),
    ).toEqual([]);
  });

  it.each([
    "@nexusdi/x exports 'Shape' and api-x.mdx has no '## `Shape`' heading",
    '@nexusdi/x has two reference pages: api-x.mdx and api-y.mdx',
  ])('fails the sabotaged tree: %s', (phrase) => {
    const findings = checkExportCoverage({
      pages: tree('sabotaged'),
      packages: [X],
      exempt: new Map(),
      allowance: {},
    });
    expect(findings.some((finding) => finding.includes(phrase))).toBe(true);
  });

  it('fails a library with no reference page, naming the page to add', () => {
    const findings = checkExportCoverage({
      pages: [],
      packages: [X],
      exempt: new Map(),
      allowance: {},
    });
    expect(findings).toEqual([
      expect.stringContaining(
        "add apps/docs/content/api-x.mdx with kind: reference and package: '@nexusdi/x'",
      ),
    ]);
  });

  it('fails a callable export no executable fence calls', () => {
    const page = parsePage(
      'apps/docs/content/api-x.mdx',
      'api-x',
      "---\nkind: reference\npackage: '@nexusdi/x'\n---\n\n## `make`\n\n```ts\nmake();\n```\n\n## `Shape`\n",
    );
    expect(
      checkExportCoverage({
        pages: [page],
        packages: [X],
        exempt: new Map(),
        allowance: {},
      }),
    ).toEqual([expect.stringContaining("'make'")]);
  });

  it('counts no import as a call', () => {
    const page = parsePage(
      'apps/docs/content/api-x.mdx',
      'api-x',
      "---\nkind: reference\npackage: '@nexusdi/x'\n---\n\n## `make`\n\n```ts twoslash\nimport { make } from '@nexusdi/x';\n```\n\n## `Shape`\n",
    );
    expect(
      checkExportCoverage({
        pages: [page],
        packages: [X],
        exempt: new Map(),
        allowance: {},
      }),
    ).toEqual([expect.stringContaining("'make'")]);
  });

  it('counts only the lines below the last cut', () => {
    const page = parsePage(
      'apps/docs/content/api-x.mdx',
      'api-x',
      "---\nkind: reference\npackage: '@nexusdi/x'\n---\n\n## `make`\n\n```ts twoslash\nimport { make } from '@nexusdi/x';\n// ---cut---\nconst shape = 1;\n```\n\n## `Shape`\n",
    );
    expect(
      checkExportCoverage({
        pages: [page],
        packages: [X],
        exempt: new Map(),
        allowance: {},
      }),
    ).toEqual([expect.stringContaining("'make'")]);
  });

  it('fails an allowance entry that is no longer needed', () => {
    const findings = checkExportCoverage({
      pages: tree('clean'),
      packages: [X],
      exempt: new Map(),
      allowance: { '@nexusdi/x': { unexercised: ['make'] } },
    });
    expect(findings).toEqual([
      expect.stringContaining(
        "'make' is exercised now; remove it from doc-export-coverage-allowance.json",
      ),
    ]);
  });

  it('keeps the allowance sorted, so a diff reads as one line', () => {
    const allowance = JSON.parse(readFileSync(ALLOWANCE, 'utf8')) as Record<
      string,
      { unexercised: string[] }
    >;
    const keys = Object.keys(allowance);

    expect(keys).toEqual([...keys].sort());
    for (const [name, entry] of Object.entries(allowance))
      expect(entry.unexercised, `${name} is out of order`).toEqual(
        [...entry.unexercised].sort(),
      );
  });

  it('holds on apps/docs', async () => {
    expect(checkExportCoverage(await workspaceInput())).toEqual([]);
  }, 180_000);
});
