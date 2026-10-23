import { describe, expect, it } from 'vitest';

import { BUNDLED_CHARTS, StarCharts } from './star-charts';

const UNCHARTED = [
  'Vega',
  'constructor',
  '__proto__',
  'toString',
  'hasOwnProperty',
];

describe('StarCharts', () => {
  const charts = new StarCharts(BUNDLED_CHARTS);

  it('holds Kepler-442b and plots its heading', () => {
    expect(charts.has('Kepler-442b')).toBe(true);
    expect(charts.plot('Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
  });

  it.each(UNCHARTED)('does not hold %s and plots it heading 0', (to) => {
    expect(charts.has(to)).toBe(false);
    expect(charts.plot(to)).toEqual({ to, heading: 0 });
  });

  it.each([
    ['a string', '42'],
    ['a null', null],
  ])('reads %s entry as uncharted', (_kind, entry) => {
    const downloaded = { 'Kepler-442b': entry } as unknown as Record<
      string,
      number
    >;
    const relayed = new StarCharts(downloaded);
    expect(relayed.has('Kepler-442b')).toBe(false);
    expect(relayed.plot('Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 0,
    });
  });
});
