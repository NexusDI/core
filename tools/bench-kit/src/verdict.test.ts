import { describe, expect, it } from 'vitest';

import { dispatchBlocks, dispatchVerdict } from './verdict.ts';

const r = (median: number, low: number, high: number) => ({
  median,
  low,
  high,
  pairs: 200,
});

describe('dispatchVerdict', () => {
  it('fails when the lower bound is above 1.03', () => {
    expect(dispatchVerdict(r(1.06, 1.04, 1.2))).toBe('fail');
    expect(dispatchVerdict(r(1.05, 1.031, 1.06))).toBe('fail');
  });
  it('reports a median above the bound as inconclusive while the interval reaches it', () => {
    expect(dispatchVerdict(r(1.04, 1.03, 1.05))).toBe('inconclusive');
    expect(dispatchVerdict(r(1.048, 0.999, 1.068))).toBe('inconclusive');
    expect(dispatchVerdict(r(1.031, 1.02, 1.04))).toBe('inconclusive');
  });
  it('reports a wide interval as inconclusive', () => {
    expect(dispatchVerdict(r(1.0, 0.95, 1.02))).toBe('inconclusive');
  });
  it('passes a median at or under the bound with a narrow interval', () => {
    expect(dispatchVerdict(r(1.02, 1.01, 1.03))).toBe('pass');
    expect(dispatchVerdict(r(1.03, 1.0, 1.055))).toBe('pass');
    expect(dispatchVerdict(r(1.03, 1.01, 1.05))).toBe('pass');
  });
});

describe('dispatchBlocks', () => {
  it('blocks a fail', () => {
    expect(dispatchBlocks('fail', r(1.06, 1.04, 1.08))).toBe(true);
  });
  it('blocks an inconclusive result whose median is above the bound', () => {
    expect(dispatchBlocks('inconclusive', r(1.048, 0.999, 1.068))).toBe(true);
  });
  it('lets an inconclusive result with the median under the bound through', () => {
    expect(dispatchBlocks('inconclusive', r(1.0, 0.95, 1.03))).toBe(false);
  });
  it('lets a pass through', () => {
    expect(dispatchBlocks('pass', r(1.02, 1.0, 1.04))).toBe(false);
  });
});
