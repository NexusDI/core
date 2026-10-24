import { describe, expect, it } from 'vitest';

import { design } from './design.ts';

describe('design', () => {
  it('records the counts and the fixed bootstrap settings', () => {
    expect(design(5, 20)).toEqual({
      order: 'williams',
      warmup: 5,
      measured: 20,
      bootstrap: { resamples: 10000, block: 3, prng: 'mulberry32' },
    });
  });

  it('sizes the bootstrap block as the cube root of the measured count, rounded up', () => {
    expect(design(0, 1000).bootstrap.block).toBe(10);
    expect(design(0, 27).bootstrap.block).toBe(3);
    expect(design(0, 28).bootstrap.block).toBe(4);
  });
});
