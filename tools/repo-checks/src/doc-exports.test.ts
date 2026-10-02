import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { checkExports } from './docs/doc-exports';
import { readExpandedSite } from './docs/loaders';
import { readPackageExports } from './docs/package-exports';
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
    expect(
      checkExports({ pages: await readExpandedSite(CONTENT), exportsOf }),
    ).toEqual([]);
  });
});
