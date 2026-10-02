import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { checkFence, tallyFences } from './docs/doc-fence';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ALLOWANCE = join(import.meta.dirname, 'doc-fence-allowance.json');
const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-fence', name, 'content'));

describe('doc-fence fixtures', () => {
  it('passes a clean tree', () => {
    expect(checkFence(tree('clean'), {})).toEqual([]);
  });

  it('counts one unexplained fence and skips the post', () => {
    expect(Object.fromEntries(tallyFences(tree('sabotaged')))).toEqual({
      tokens: { unexplained: 1, regions: 1, abusable: 2 },
    });
  });

  it('fails an unexplained fence, and more exemptions than executed regions', () => {
    expect(checkFence(tree('sabotaged'), {})).toEqual([
      'tokens: 1 unexplained fence, allowance 0. Cite a doctested region with file= region=, use a twoslash fence, or tag the block with signature, no-run, anti-example, fails-type-check or elided. The allowance in doc-fence-allowance.json only goes down.',
      'tokens: 2 fences tagged anti-example or no-run against 1 executed region. Documentation standard section 5 caps the two tags at the executed count. Cite a region.',
    ]);
  });

  it('fails an allowance above the count, and an allowance for a page that is gone', () => {
    expect(checkFence(tree('clean'), { tokens: 2, gone: 1 })).toEqual([
      'doc-fence-allowance.json: gone has no page. Remove the entry.',
      'doc-fence-allowance.json: tokens: 0, allowance 2. Lower the entry to the count, and remove it at zero.',
    ]);
  });
});

describe('doc-fence on apps/docs', () => {
  it('holds', () => {
    expect(
      checkFence(
        readSite(CONTENT),
        readAllowance<Record<string, number>>(ALLOWANCE),
      ),
    ).toEqual([]);
  });
});
