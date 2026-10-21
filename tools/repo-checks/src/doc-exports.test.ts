import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readPackageExports } from '@nexusdi/doc-examples/package-exports';
import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { checkExports } from './docs/doc-exports';
import { readExpandedSite } from './docs/loaders';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const STUB = new Map([
  ['@nexusdi/core', new Set(['Nexus', 'Token'])],
  ['@nexusdi/testing', new Set(['createTestingContainer'])],
]);
const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-exports', name, 'content'));

describe('doc-exports fixtures', () => {
  it('passes a clean tree', () => {
    expect(checkExports({ pages: tree('clean'), exportsOf: STUB })).toEqual([]);
  });

  it.each([
    "'Missing' is not exported by '@nexusdi/core'",
    "'@nexusdi/core/internal' is not an entry of the exports map",
    "'default' is not exported by '@nexusdi/core'",
    'the signature fence sits under "## Setup", which names no export',
    "the mermaid fence names '@nexusdi/core#Gone', and 'Gone' is not exported",
  ])('fails the sabotaged tree: %s', (phrase) => {
    const findings = checkExports({
      pages: tree('sabotaged'),
      exportsOf: STUB,
    });
    expect(
      findings.some(
        (finding) =>
          finding.includes('testing.mdx') && finding.includes(phrase),
      ),
    ).toBe(true);
  });

  it('accepts an import from a demo entry, and a signature fence only under a published export', () => {
    const fence = (body: string, tags: string[], section: string) => ({
      lang: 'ts',
      meta: tags.join(' '),
      tags,
      body,
      line: 1,
      section,
    });
    const page = {
      slug: 'federation',
      file: 'federation.mdx',
      source: '',
      body: '',
      frontmatter: {},
      kind: 'question',
      headings: [],
      sections: [],
      fences: [
        fence(
          "import { meridianShared } from '@nexusdi/federation-contracts/shared';",
          [],
          'Share one core',
        ),
        fence('meridianShared(): object', ['signature'], '`meridianShared()`'),
      ],
    };
    const demoExportsOf = new Map([
      ['@nexusdi/federation-contracts/shared', new Set(['meridianShared'])],
    ]);
    const findings = checkExports({
      pages: [page],
      exportsOf: STUB,
      demoExportsOf,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('which names no export');
    expect(checkExports({ pages: [page], exportsOf: STUB })).toContainEqual(
      expect.stringContaining(
        "'@nexusdi/federation-contracts/shared' is not an entry of the exports map",
      ),
    );
  });

  it('skips a post that describes a version below 0.4.0, and reports nothing else', () => {
    const findings = checkExports({
      pages: tree('sabotaged'),
      exportsOf: STUB,
    });
    expect(
      findings.filter((finding) => finding.includes('old-post.mdx')),
    ).toEqual([]);
    expect(findings).toHaveLength(5);
  });
});

describe('doc-exports on apps/docs', () => {
  it('holds', async () => {
    const libs = join(workspaceRoot, 'libs');
    const exportsOf = new Map(
      readdirSync(libs)
        .filter((name) => existsSync(join(libs, name, 'package.json')))
        .flatMap((name) => [
          ...readPackageExports(join(libs, name, 'package.json')),
        ])
        .map(([specifier, entries]) => [
          specifier,
          new Set(entries.map((entry) => entry.name)),
        ]),
    );
    // The demo packages under examples/ that declare an exports map.
    const examples = join(workspaceRoot, 'examples');
    const demoExportsOf = new Map(
      readdirSync(examples)
        .map((name) => join(examples, name, 'package.json'))
        .filter(
          (file) =>
            existsSync(file) &&
            'exports' in (JSON.parse(readFileSync(file, 'utf8')) as object),
        )
        .flatMap((file) => [...readPackageExports(file)])
        .map(([specifier, entries]) => [
          specifier,
          new Set(entries.map((entry) => entry.name)),
        ]),
    );
    expect(
      checkExports({
        pages: await readExpandedSite(CONTENT),
        exportsOf,
        demoExportsOf,
      }),
    ).toEqual([]);
  });
});
