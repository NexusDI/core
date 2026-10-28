import { describe, expect, it } from 'vitest';

import { byCodeUnit } from './by-code-unit';

describe('byCodeUnit', () => {
  it('returns a negative, zero or positive number', () => {
    expect(byCodeUnit('a', 'b')).toBeLessThan(0);
    expect(byCodeUnit('b', 'a')).toBeGreaterThan(0);
    expect(byCodeUnit('a', 'a')).toBe(0);
  });

  it('orders by UTF-16 code unit and ignores the locale', () => {
    expect(['b', 'a', 'B', 'A', 'é', 'z'].sort(byCodeUnit)).toEqual([
      'A',
      'B',
      'a',
      'b',
      'z',
      'é',
    ]);
  });

  it('puts a prefix before the longer name', () => {
    expect(['deck-10', 'deck-1', 'deck'].sort(byCodeUnit)).toEqual([
      'deck',
      'deck-1',
      'deck-10',
    ]);
  });
});
