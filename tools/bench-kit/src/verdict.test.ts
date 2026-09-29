import { describe, expect, it } from 'vitest';

import { dispatchVerdict } from './verdict.ts';

const r = (median: number, low: number, high: number) => ({
  median,
  low,
  high,
  pairs: 200,
});

describe('dispatchVerdict', () => {
  it('fails when the lower bound is above 1.03', () => {
    expect(dispatchVerdict(r(1.06, 1.04, 1.2))).toBe('fail');
  });
  it('reports a wide interval as inconclusive', () => {
    expect(dispatchVerdict(r(1.0, 0.95, 1.02))).toBe('inconclusive');
  });
  it('passes a narrow interval at or under the bound', () => {
    expect(dispatchVerdict(r(1.02, 1.01, 1.03))).toBe('pass');
    expect(dispatchVerdict(r(1.04, 1.03, 1.05))).toBe('pass');
  });
});
