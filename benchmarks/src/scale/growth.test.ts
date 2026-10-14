import { mulberry32 } from '@nexusdi/bench-kit';
import { describe, expect, it } from 'vitest';

import { SIZES } from './config.ts';
import { localExponent, marginalPerProvider } from './growth.ts';

const ROUNDS = 200;
// The default 10,000 resamples take seconds; the transform needs few.
const RESAMPLES = 500;

/** Per-round times for each size: f(n) times a noise factor shared by every size of the round. */
function series(f: (n: number) => number, seed = 1): Map<number, number[]> {
  const rand = mulberry32(seed);
  const noise = Array.from({ length: ROUNDS }, () => 0.8 + 0.6 * rand());
  return new Map(SIZES.map((n) => [n, noise.map((x) => x * f(n))]));
}
const at = (m: Map<number, number[]>, n: number) => m.get(n) ?? [];

describe('localExponent', () => {
  it('reads 1.2 from t = 3 * n^1.2 at every adjacent pair', () => {
    const t = series((n) => 3 * n ** 1.2);
    for (let i = 1; i < SIZES.length; i++) {
      const lo = SIZES[i - 1] ?? 0;
      const hi = SIZES[i] ?? 0;
      const g = localExponent(at(t, lo), at(t, hi), lo, hi, 7, RESAMPLES);
      expect(g.exponent).toBeCloseTo(1.2, 9);
    }
  });

  it('reads a fixed cost as growth that rises pair by pair, in closed form', () => {
    const t = series((n) => 100_000 + 50 * n);
    const b = (lo: number, hi: number) =>
      localExponent(at(t, lo), at(t, hi), lo, hi, 7, RESAMPLES).exponent;
    const small = b(50, 200);
    const middle = b(200, 1000);
    const large = b(1000, 5000);
    expect(small).toBeCloseTo(Math.log(110000 / 102500) / Math.log(4), 9);
    expect(middle).toBeCloseTo(Math.log(150000 / 110000) / Math.log(5), 9);
    expect(large).toBeCloseTo(Math.log(350000 / 150000) / Math.log(5), 9);
    expect(small).toBeLessThan(middle);
    expect(middle).toBeLessThan(large);
  });

  it('gives the same interval for the same seed, around the point estimate', () => {
    // Independent noise per size, so the paired ratios vary round to round.
    const f = (n: number) => 3 * n ** 1.1 + 40 * n;
    const lo = series(f, 1);
    const hi = series(f, 2);
    const run = (seed: number) =>
      localExponent(at(lo, 200), at(hi, 1000), 200, 1000, seed, RESAMPLES);
    const a = run(3);
    expect(run(3)).toEqual(a);
    expect(a.low).toBeLessThanOrEqual(a.exponent);
    expect(a.high).toBeGreaterThanOrEqual(a.exponent);
    expect(a.high).toBeGreaterThan(a.low);
  });

  it('rejects sizes that are not increasing', () => {
    expect(() => localExponent([1], [2], 200, 200, 1)).toThrow(/increasing/);
  });
});

describe('marginalPerProvider', () => {
  it('equals the slope of a linear set', () => {
    const flat = new Map(
      SIZES.map((n) => [n, new Array<number>(ROUNDS).fill(1234 + 56.5 * n)]),
    );
    expect(marginalPerProvider(at(flat, 1000), at(flat, 5000))).toBeCloseTo(
      56.5,
      9,
    );
  });

  it('takes medians, so one slow round does not move it', () => {
    const lo = new Array<number>(101).fill(1000);
    const hi = new Array<number>(101).fill(5000);
    hi[3] = 1e12;
    expect(marginalPerProvider(lo, hi)).toBe(1);
  });
});
