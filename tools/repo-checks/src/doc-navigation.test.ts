import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkNavigation, loadNavigation } from './docs/doc-navigation';
import { CONTENT, FIXTURES } from './docs/paths';
import { readMeta, readSite } from './docs/site';

const KINDS = [
  'overview',
  'tutorial',
  'concept',
  'question',
  'platform',
  'contract',
  'reference',
  'code',
  'blog',
  'post',
];
const TEACHING = ['tutorial', 'concept'];

async function run(
  contentDir: string,
  kinds: readonly string[] = KINDS,
  teaching: readonly string[] = TEACHING,
) {
  return checkNavigation({
    pages: readSite(contentDir),
    meta: await readMeta(contentDir),
    contentDir,
    kinds,
    teaching,
  });
}

describe('doc-navigation fixtures', () => {
  const tree = (name: string) =>
    join(FIXTURES, 'doc-navigation', name, 'content');

  it('passes a clean tree', async () => {
    expect(await run(tree('clean'))).toEqual([]);
  });

  it.each([
    ['ghost', 'names no page'],
    ['orphan.mdx', 'is not a key in _meta.ts'],
    ['index.mdx', 'has 2 "# " headings'],
    ['providers.mdx', "kind 'lesson' is not one of"],
    [
      'lifetimes.mdx',
      'follows the teaching page tokens and carries no requires',
    ],
    [
      'modules.mdx',
      "requires 'tokens', which is not one of the two pages before it",
    ],
    [
      'errors.mdx',
      "requires 'testing', whose kind 'question' is not a teaching kind",
    ],
  ])('fails the sabotaged tree on %s', async (file, phrase) => {
    const findings = await run(tree('sabotaged'));
    expect(
      findings.some(
        (finding) => finding.includes(file) && finding.includes(phrase),
      ),
    ).toBe(true);
  });

  it('reports nothing else on the sabotaged tree', async () => {
    expect(await run(tree('sabotaged'))).toHaveLength(7);
  });
});

describe('doc-navigation on apps/docs', () => {
  it('holds', async () => {
    const navigation = await loadNavigation();
    expect(
      await run(CONTENT, navigation.pageKinds, navigation.teachingKinds),
    ).toEqual([]);
  });
});
