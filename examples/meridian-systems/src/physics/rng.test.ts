import { describe, expect, it } from 'vitest';

import expected from './__fixtures__/rng.seed-7.json';
import { fnv1a32, splitmix32 } from './rng';

describe('fnv1a32', () => {
  it('matches the published FNV-1a vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });
});

describe('splitmix32', () => {
  it('reproduces the first 1,000 values of seed 7', () => {
    let state = 7;
    const values: number[] = [];
    for (let i = 0; i < expected.length; i++) {
      const step = splitmix32(state);
      state = step.state;
      values.push(step.value);
    }
    expect(values).toEqual(expected);
  });

  it('returns only uint32 values', () => {
    let state = 123456789;
    for (let i = 0; i < 1000; i++) {
      const step = splitmix32(state);
      state = step.state;
      expect(Number.isInteger(step.value)).toBe(true);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
