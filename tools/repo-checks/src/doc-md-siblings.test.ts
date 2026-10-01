import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { checkSiblings } from './docs/doc-md-siblings';
import { loadMdSiblings, loadRegions } from './docs/loaders';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ROOT = join(FIXTURES, 'doc-md-siblings');

async function regionCodeUnder(root: string) {
  const { readRegion } = await loadRegions();
  return (path: string, name: string) =>
    readRegion(readFileSync(join(root, path), 'utf8'), path, name).code;
}

describe('doc-md-siblings fixtures', () => {
  it('passes the siblings the md-siblings module writes', async () => {
    const mdSiblings = await loadMdSiblings();
    expect(
      checkSiblings({
        pages: readSite(join(ROOT, 'content')),
        siblings: mdSiblings(join(ROOT, 'content'), ROOT, {
          classPrefix: 'nexus',
        }),
        regionCode: await regionCodeUnder(ROOT),
      }),
    ).toEqual([]);
  });

  it('fails a missing sibling and a sibling written from unexpanded source', async () => {
    const pages = readSite(join(ROOT, 'content'));
    const raw = readFileSync(join(ROOT, 'content', 'tokens.mdx'), 'utf8');
    expect(
      checkSiblings({
        pages,
        siblings: new Map([['tokens.md', raw]]),
        regionCode: await regionCodeUnder(ROOT),
      }),
    ).toEqual([
      'index.md: no sibling was written for tools/repo-checks/src/__fixtures__/docs/doc-md-siblings/content/index.mdx. The .md sibling of every page is part of the agent surface (standard section 5a).',
      "tokens.md: lacks the code of region 'ship' from examples/meridian/src/ship.ts. Write siblings after region expansion, as md-siblings.mjs does.",
    ]);
  });
});

describe('doc-md-siblings on apps/docs', () => {
  it('holds', async () => {
    const mdSiblings = await loadMdSiblings();
    expect(
      checkSiblings({
        pages: readSite(CONTENT),
        siblings: mdSiblings(CONTENT, workspaceRoot, { classPrefix: 'nexus' }),
        regionCode: await regionCodeUnder(workspaceRoot),
      }),
    ).toEqual([]);
  });
});
