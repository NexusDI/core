import { describe, expect, it } from 'vitest';

import { fixed, kilopascals, megawatts } from '../app/bridge/fixed';

describe('fixed', () => {
  it("rounds a float's noise away", () => {
    expect(fixed(0.18000000000000002, 2)).toBe('0.18');
    expect(fixed(502.49791096128916, 1)).toBe('502.5');
  });

  it('pads to the digits it is given', () => {
    expect(fixed(0, 2)).toBe('0.00');
    expect(fixed(101.286, 1)).toBe('101.3');
  });

  it('writes no decimal point for no digits', () => {
    expect(fixed(2346.4005577926628, 0)).toBe('2,346');
    expect(fixed(999.6, 0)).toBe('1,000');
  });

  it('puts a comma between each group of three integer digits', () => {
    expect(fixed(1210, 1)).toBe('1,210.0');
    expect(fixed(1_234_567.891, 2)).toBe('1,234,567.89');
    expect(fixed(999.99, 1)).toBe('1,000.0');
  });

  it('groups a negative value after its sign', () => {
    expect(fixed(-1234.5, 1)).toBe('-1,234.5');
  });
});

describe('kilopascals', () => {
  it('writes pascals as kPa to the digits it is given', () => {
    expect(kilopascals(101204.28596604968, 1)).toBe('101.2 kPa');
    expect(kilopascals(21253, 2)).toBe('21.25 kPa');
    expect(kilopascals(0, 1)).toBe('0.0 kPa');
  });
});

describe('megawatts', () => {
  it('writes watts in MW to 0.1', () => {
    expect(megawatts(5_000_000.000000001)).toBe('5.0 MW');
    expect(megawatts(12_100_000)).toBe('12.1 MW');
    expect(megawatts(0)).toBe('0.0 MW');
  });
});
