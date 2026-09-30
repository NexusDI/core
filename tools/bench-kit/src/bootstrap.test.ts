import { describe, expect, it } from 'vitest';

import { blockSize, clusteredRatio, pairedRatio } from './bootstrap.ts';
import { mulberry32 } from './random.ts';

describe('mulberry32', () => {
  it('repeats its sequence for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('yields values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('pairedRatio', () => {
  it('uses blocks of ceil(n^(1/3))', () => {
    expect(blockSize(1000)).toBe(10);
    expect(blockSize(200)).toBe(6);
  });
  it('takes the median of per-pair ratios', () => {
    const r = pairedRatio([2, 4, 6], [1, 2, 3], 1, 100);
    expect(r.median).toBe(2);
    expect(r.pairs).toBe(3);
  });
  it('brackets the median with its interval', () => {
    const rand = mulberry32(3);
    const a = Array.from({ length: 1000 }, () => 100 + rand() * 10);
    const b = a.map((x) => x / (1.1 + (rand() - 0.5) * 0.02));
    const r = pairedRatio(a, b, 9, 2000);
    expect(r.low).toBeLessThanOrEqual(r.median);
    expect(r.high).toBeGreaterThanOrEqual(r.median);
    expect(r.low).toBeGreaterThan(1.09);
    expect(r.high).toBeLessThan(1.11);
  });
  it('reproduces the interval for a seed', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [1, 1, 3, 3, 5, 5, 7, 7];
    expect(pairedRatio(a, b, 5, 500)).toEqual(pairedRatio(a, b, 5, 500));
  });
  it('rejects samples of different lengths', () => {
    expect(() => pairedRatio([1, 2], [1], 1)).toThrow(/same length/);
  });
});

describe('clusteredRatio', () => {
  // Four processes of 25 pairs, each with its own offset.
  const rand = mulberry32(11);
  const offsets = [0.96, 1.0, 1.04, 1.08];
  const a = offsets.flatMap((o) =>
    Array.from({ length: 25 }, () => o * (1 + (rand() - 0.5) * 0.002)),
  );
  const b = a.map(() => 1);

  it('widens the interval to the process-to-process spread', () => {
    const short = pairedRatio(a, b, 2, 2000);
    const whole = clusteredRatio(a, b, 2, 25, 2000);
    expect(whole.high - whole.low).toBeGreaterThan(short.high - short.low);
  });
  it('resamples an only process to itself', () => {
    const one = a.slice(0, 25);
    const r = clusteredRatio(
      one,
      one.map(() => 1),
      4,
      25,
      500,
    );
    expect(r.low).toBeGreaterThan(0.95);
    expect(r.high).toBeLessThan(0.97);
  });
  it('rejects pairs that do not split into clusters', () => {
    expect(() => clusteredRatio([1, 2, 3], [1, 1, 1], 1, 2)).toThrow(
      /clusters of 2/,
    );
  });
});
