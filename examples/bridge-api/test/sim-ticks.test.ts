import { describe, expect, it } from 'vitest';

import { parseTicks, TICKS_REFUSED } from '../src/bridge/sim-ticks';

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

describe('TICKS_REFUSED', () => {
  it('is the code, message and fix of every other refusal', () => {
    expect(TICKS_REFUSED).toEqual({
      code: 'BRIDGE_BAD_TICKS',
      message:
        'POST /sim/advance needs a whole number of ticks from 1 to 10,000.',
      fix: 'send { "ticks": n } with n a whole number from 1 to 10000.',
    });
  });
});
