import { describe, expect, it } from 'vitest';

import { ratchet, waits } from './allowance';

describe('ratchet', () => {
  it('reports a count above its allowance, and a count with no entry', () => {
    expect(ratchet({ tokens: 3, lazy: 1 }, { tokens: 2 }).over).toEqual([
      'lazy: 1, allowance 0',
      'tokens: 3, allowance 2',
    ]);
  });

  it('reports an allowance larger than the count as slack', () => {
    expect(ratchet({ tokens: 1 }, { tokens: 2 }).slack).toEqual([
      'tokens: 1, allowance 2',
    ]);
  });

  it('reports an allowance for a key with no count as stale', () => {
    expect(ratchet({}, { gone: 1 }).stale).toEqual(['gone']);
  });

  it('ignores a key at zero with no entry', () => {
    expect(ratchet({ tokens: 0 }, {})).toEqual({
      over: [],
      slack: [],
      stale: [],
    });
  });
});

describe('waits', () => {
  it('reports an entry whose work is done as stale', () => {
    expect(
      waits(new Set(['tokens']), { tokens: 'Phase 2', api: 'Phase 2' }).stale,
    ).toEqual(['tokens']);
  });

  it('reports an entry with an empty reason', () => {
    expect(waits(new Set(), { api: ' ' }).unexplained).toEqual(['api']);
  });
});
