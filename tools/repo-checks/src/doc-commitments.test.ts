import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { checkCommitments, type Commitment } from './docs/doc-commitments';
import { CONTENT, DOCS } from './docs/paths';
import { parsePage, readSite } from './docs/site';

const ALLOWANCE = join(import.meta.dirname, 'doc-commitments-allowance.json');
const ROWS: Commitment[] = [
  {
    line: 254,
    commitment: 'A class with defaults needs deps.',
    targets: [
      {
        page: 'providers',
        heading: 'A class whose constructor has defaults or rest parameters',
        level: 2,
      },
    ],
  },
  {
    line: 1203,
    commitment: 'Each code links to a page.',
    targets: [
      {
        page: 'api-errors',
        heading: null,
        level: 3,
        coveredBy: 'doc-error-codes',
      },
    ],
  },
];
const page = (slug: string, body: string) =>
  parsePage(`apps/docs/content/${slug}.mdx`, slug, `# Title\n\n${body}\n`);

describe('doc-commitments fixtures', () => {
  it('passes when every heading is on its page', () => {
    const pages = [
      page(
        'providers',
        '## A class whose constructor has defaults or rest parameters',
      ),
      page('api-errors', ''),
    ];
    expect(checkCommitments({ rows: ROWS, pages, allowance: {} })).toEqual([]);
  });

  it('fails a heading at the wrong level, and a missing page no allowance records', () => {
    const pages = [
      page(
        'providers',
        '### A class whose constructor has defaults or rest parameters',
      ),
    ];
    expect(checkCommitments({ rows: ROWS, pages, allowance: {} })).toEqual([
      "commitments.json line 1203: the page 'api-errors' does not exist. Write it, or record the wait in doc-commitments-allowance.json.",
      "commitments.json line 254: 'providers' has no ## heading 'A class whose constructor has defaults or rest parameters'. Core spec line 254 promises it.",
    ]);
  });

  it('fails an allowance entry whose page exists, and an empty reason', () => {
    const pages = [
      page(
        'providers',
        '## A class whose constructor has defaults or rest parameters',
      ),
      page('api-errors', ''),
    ];
    expect(
      checkCommitments({
        rows: ROWS,
        pages,
        allowance: { providers: 'Phase 2', lifecycle: '' },
      }),
    ).toEqual([
      "doc-commitments-allowance.json: 'lifecycle' records no reason. Say what the page waits for.",
      "doc-commitments-allowance.json: 'providers' exists now. Remove the entry.",
    ]);
  });
});

describe('doc-commitments on apps/docs', () => {
  it('holds', () => {
    expect(
      checkCommitments({
        rows: readAllowance<Commitment[]>(join(DOCS, 'commitments.json')),
        pages: readSite(CONTENT),
        allowance: readAllowance<Record<string, string>>(ALLOWANCE),
      }),
    ).toEqual([]);
  });

  it('holds the nine commitments of spec section 4.5', () => {
    expect(
      readAllowance<Commitment[]>(join(DOCS, 'commitments.json')).map(
        (row) => row.line,
      ),
    ).toEqual([254, 393, 466, 818, 1034, 1110, 1203, 1239, 1301]);
  });
});
