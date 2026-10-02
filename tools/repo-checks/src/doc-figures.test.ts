import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkFigures } from './docs/doc-prose';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-prose', name, 'content'));

describe('doc-figures fixtures', () => {
  it('passes a clean tree', () => {
    expect(checkFigures(tree('clean'))).toEqual([]);
  });

  it('fails a figure of speech in prose', () => {
    expect(checkFigures(tree('sabotaged'))).toEqual([
      'tools/repo-checks/src/__fixtures__/docs/doc-prose/sabotaged/content/tokens.mdx:11: "lands" -- say what arrives and where',
    ]);
  });
});

describe('doc-figures on apps/docs', () => {
  it('holds', () => {
    expect(checkFigures(readSite(CONTENT))).toEqual([]);
  });
});
