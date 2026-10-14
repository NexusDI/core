import { describe, expect, it } from 'vitest';

import { least, most } from './extent.js';

describe('least and most', () => {
  it('match Math.min and Math.max, with a start value for an empty list', () => {
    expect(least([3, 1, 2], Infinity)).toBe(1);
    expect(most([3, 1, 2], -Infinity)).toBe(3);
    expect(least([], Infinity)).toBe(Infinity);
    expect(most([], 0)).toBe(0);
    expect(most([-2, -1], 0)).toBe(0);
  });

  it('take a million values, past the argument limit of a spread call', () => {
    const values = Array.from({ length: 1_000_000 }, (_, i) => i);
    expect(least(values, Infinity)).toBe(0);
    expect(most(values, -Infinity)).toBe(999_999);
  });
});
