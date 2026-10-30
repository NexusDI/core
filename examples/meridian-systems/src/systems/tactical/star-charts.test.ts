import { describe, expect, it } from 'vitest';

import { UnchartedStarError } from '../../errors';

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

  it('lists the stars of the bundled table in the table order', () => {
    expect(charts.stars()).toEqual(['Kepler-442b', 'Proxima-b', 'TRAPPIST-1e']);
  });

  it('leaves out an entry that is not a finite heading', () => {
    const relayed = new StarCharts({
      'Kepler-442b': 42,
      Vega: Number.NaN,
      'Proxima-b': 117,
    });
    expect(relayed.stars()).toEqual(['Kepler-442b', 'Proxima-b']);
  });

  it.each(UNCHARTED)('does not hold %s and refuses to plot it', (to) => {
    expect(charts.has(to)).toBe(false);
    expect(() => charts.plot(to)).toThrow(UnchartedStarError);
  });

  it('names the star and the charted stars on the refusal', () => {
    try {
      charts.plot('Vega');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnchartedStarError);
      expect({ ...(error as UnchartedStarError) }).toEqual({
        star: 'Vega',
        charted: ['Kepler-442b', 'Proxima-b', 'TRAPPIST-1e'],
      });
    }
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
    expect(() => relayed.plot('Kepler-442b')).toThrow(UnchartedStarError);
  });
});
