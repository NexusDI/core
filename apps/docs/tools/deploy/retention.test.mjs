// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { addMonths, retentionEnded } from './retention.mjs';

describe('retentionEnded', () => {
  const finalDate = '2027-01-15';

  it('keeps /v0.3/ before final', () => {
    expect(
      retentionEnded({
        finalDate: null,
        v050Date: null,
        today: new Date('2030-01-01'),
      }),
    ).toBe(false);
  });

  it('keeps /v0.3/ for six months after final with no 0.5.0', () => {
    expect(
      retentionEnded({
        finalDate,
        v050Date: null,
        today: new Date('2028-06-01'),
      }),
    ).toBe(false);
  });

  it('keeps /v0.3/ inside six months when 0.5.0 came first', () => {
    expect(
      retentionEnded({
        finalDate,
        v050Date: '2027-03-01',
        today: new Date('2027-07-14'),
      }),
    ).toBe(false);
  });

  it('ends once six months have passed and 0.5.0 is tagged', () => {
    expect(
      retentionEnded({
        finalDate,
        v050Date: '2027-03-01',
        today: new Date('2027-07-15'),
      }),
    ).toBe(true);
  });

  it('ends on the 0.5.0 date when 0.5.0 is later than six months', () => {
    expect(
      retentionEnded({
        finalDate,
        v050Date: '2027-11-02',
        today: new Date('2027-11-02'),
      }),
    ).toBe(true);
  });
});

describe('addMonths', () => {
  it('clamps to the last day of a short month', () => {
    expect(addMonths('2027-08-31', 6).toISOString().slice(0, 10)).toBe(
      '2028-02-29',
    );
  });
});
