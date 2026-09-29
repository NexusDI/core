import { describe, expect, it } from 'vitest';

import { mad, median, percentile, summarize } from './stats.ts';

describe('stats', () => {
  it('takes the middle value of an odd sample', () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it('averages the two middle values of an even sample', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('reports the median absolute deviation', () => {
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });
  it('interpolates percentiles linearly', () => {
    const xs = Array.from({ length: 101 }, (_, i) => i);
    expect(percentile(xs, 5)).toBe(5);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile([10, 20], 50)).toBe(15);
  });
  it('flags a sample whose MAD exceeds 5% of the median', () => {
    expect(summarize([90, 95, 100, 106, 110]).noisy).toBe(true);
    expect(summarize([100, 101, 100, 99, 100]).noisy).toBe(false);
  });
  it('refuses an empty sample', () => {
    expect(() => median([])).toThrow(/empty/);
  });
  it('leaves its input unsorted', () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});
