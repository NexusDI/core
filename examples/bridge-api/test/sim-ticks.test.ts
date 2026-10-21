import { describe, expect, it } from 'vitest';

import { parseTicks } from '../src/bridge/sim-ticks';

describe('parseTicks', () => {
  it('reads a whole number of ticks from 1 to 10000', () => {
    expect(parseTicks({ ticks: 3 })).toBe(3);
    expect(parseTicks({ ticks: 1 })).toBe(1);
    expect(parseTicks({ ticks: 10_000 })).toBe(10_000);
  });

  it.each([
    ['zero', { ticks: 0 }],
    ['a fraction', { ticks: 1.5 }],
    ['more than 10000', { ticks: 10_001 }],
    ['a string', { ticks: '3' }],
    ['a missing field', {}],
    ['a number body', 3],
    ['a null body', null],
    ['an undefined body', undefined],
  ])('gives undefined for %s', (_what, body) => {
    expect(parseTicks(body)).toBeUndefined();
  });
});
