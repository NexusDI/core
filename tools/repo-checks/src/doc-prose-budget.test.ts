import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { checkProseBudget, proseWords } from './docs/doc-prose-budget';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ACCEPTED = join(import.meta.dirname, 'doc-prose-budget.json');
const pages = () => readSite(join(FIXTURES, 'doc-prose-budget', 'content'));

describe('doc-prose-budget fixtures', () => {
  it('counts prose words and leaves out frontmatter, fences, headings and tags', () => {
    expect(
      proseWords(
        '---\ntitle: x\n---\n\n# Head\n\nOne two <b>three</b>.\n\n```ts\nfour five\n```\n',
      ),
    ).toBe(3);
  });

  it('reports a page over 1,200 words and exempts a page whose slug starts with api', () => {
    expect(checkProseBudget(pages(), {}).over).toEqual([
      'upgrade-api-map: 1260 words of prose against a budget of 1200. Cut it or split it, or record the reviewer’s acceptance in doc-prose-budget.json.',
    ]);
  });

  it('reports nothing for a page the reviewer accepted', () => {
    expect(
      checkProseBudget(pages(), {
        'upgrade-api-map': 'About 45 entries, one per 0.3 API.',
      }).over,
    ).toEqual([]);
  });

  it('fails an acceptance for a page under the budget or with no page', () => {
    expect(checkProseBudget(pages(), { tokens: 'x', gone: 'y' }).stale).toEqual(
      [
        "doc-prose-budget.json: 'gone' has no page. Remove the entry.",
        "doc-prose-budget.json: 'tokens' is within the budget. Remove the entry.",
      ],
    );
  });
});

describe('doc-prose-budget on apps/docs', () => {
  it('reports the pages over budget and fails only on a stale acceptance', () => {
    const { over, stale } = checkProseBudget(
      readSite(CONTENT),
      readAllowance<Record<string, string>>(ACCEPTED),
    );
    for (const line of over) console.warn(`G8 doc-prose-budget: ${line}`);
    expect(stale).toEqual([]);
  });
});
