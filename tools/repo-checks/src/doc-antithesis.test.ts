import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkAntithesis } from './docs/doc-prose';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-prose', name, 'content'));

describe('doc-antithesis fixtures', () => {
  it('passes a clean tree', () => {
    expect(checkAntithesis(tree('clean'))).toEqual([]);
  });

  it('fails a sentence that pairs a not clause with a but clause', () => {
    expect(checkAntithesis(tree('sabotaged'))).toEqual([
      'tools/repo-checks/src/__fixtures__/docs/doc-prose/sabotaged/content/tokens.mdx:8: A token is not a string but an object.',
    ]);
  });
});

describe('doc-antithesis on apps/docs', () => {
  it('holds', () => {
    expect(checkAntithesis(readSite(CONTENT))).toEqual([]);
  });
});
