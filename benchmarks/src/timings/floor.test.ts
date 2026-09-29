import { describe, expect, it } from 'vitest';

import { checkFloor } from './floor.ts';

describe('checkFloor', () => {
  it('fails a run whose median is under 2 ns', () => {
    expect(() =>
      checkFloor([
        {
          library: 'x',
          variant: 'plain',
          scenario: 'resolve-singleton',
          stats: { median: 1.2 },
        },
      ]),
    ).toThrow(/below the 2 ns floor: x\/plain resolve-singleton/);
  });
  it('passes real work', () => {
    expect(() =>
      checkFloor([
        {
          library: 'x',
          variant: 'plain',
          scenario: 'ready',
          stats: { median: 900 },
        },
      ]),
    ).not.toThrow();
  });
});
