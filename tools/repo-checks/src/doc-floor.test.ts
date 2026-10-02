import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { checkFloor } from './docs/doc-floor';
import { loadNavigation } from './docs/doc-navigation';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ALLOWANCE = join(import.meta.dirname, 'doc-floor-allowance.json');

describe('doc-floor fixtures', () => {
  const floor = { index: 'overview' };
  const concepts = ['tokens', 'providers'];
  const tree = (name: string) =>
    readSite(join(FIXTURES, 'doc-floor', name, 'content'));

  it('passes a clean tree with no allowance', () => {
    expect(
      checkFloor({ pages: tree('clean'), floor, concepts, allowance: {} }),
    ).toEqual([]);
  });

  it('reads a concept page written as a folder index (spec section 3.3)', () => {
    expect(
      checkFloor({
        pages: tree('clean'),
        floor: {},
        concepts: ['errors'],
        allowance: {},
      }),
    ).toEqual([]);
  });

  it('fails a floor page with the wrong kind', () => {
    expect(
      checkFloor({
        pages: tree('sabotaged'),
        floor,
        concepts,
        allowance: { providers: 'Phase 2' },
      }),
    ).toEqual([
      "apps/docs/content/index.mdx: the floor page 'index' has kind 'tutorial'. Set kind: overview.",
    ]);
  });

  it('fails a missing concept page that no allowance records', () => {
    expect(
      checkFloor({
        pages: tree('sabotaged'),
        floor: {},
        concepts,
        allowance: {},
      }),
    ).toEqual([
      "apps/docs/content/providers.mdx: the concept page 'providers' does not exist. Write it with kind: concept, or record the wait in doc-floor-allowance.json.",
    ]);
  });

  it('fails an allowance entry whose page now exists, and an empty reason', () => {
    expect(
      checkFloor({
        pages: tree('sabotaged'),
        floor: {},
        concepts,
        allowance: { tokens: 'Phase 2', providers: '' },
      }),
    ).toEqual([
      "doc-floor-allowance.json: 'providers' records no reason. Say what the page waits for.",
      "doc-floor-allowance.json: 'tokens' exists now. Remove the entry.",
    ]);
  });
});

describe('doc-floor on apps/docs', () => {
  it('holds', async () => {
    const navigation = await loadNavigation();
    expect(
      checkFloor({
        pages: readSite(CONTENT),
        floor: navigation.floorPages,
        concepts: navigation.conceptPages,
        allowance: readAllowance<Record<string, string>>(ALLOWANCE),
      }),
    ).toEqual([]);
  });
});
