import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkNotices } from './docs/doc-notices';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-notices', name, 'content'));
const dir =
  'tools/repo-checks/src/__fixtures__/docs/doc-notices/sabotaged/content';

describe('doc-notices fixtures', () => {
  it('passes a clean tree', () => {
    expect(checkNotices(tree('clean'))).toEqual([]);
  });

  it('fails an unknown kind, a Callout, three notices and two adjacent ones', () => {
    expect(checkNotices(tree('sabotaged'))).toEqual([
      `${dir}/lazy.mdx: <Callout> is not a notice on this site. Write <Notice kind="note">, "exception", "warning" or "ship".`,
      `${dir}/lazy.mdx: <Notice kind="tip"> names no label. The kinds are note, exception, warning and ship.`,
      `${dir}/scopes.mdx: carries 3 notices. A page carries at most two.`,
      `${dir}/scopes.mdx: the note and warning notices are adjacent. Put prose between them, or drop one.`,
    ]);
  });
});

describe('doc-notices on apps/docs', () => {
  it('holds', () => {
    expect(checkNotices(readSite(CONTENT))).toEqual([]);
  });
});
