import { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { UnchartedStarError } from '@nexusdi/meridian-systems';
import { BUNDLED_CHARTS, StarCharts } from '@nexusdi/meridian-systems/charts';
import { shipText } from '@nexusdi/meridian-systems/text';
import { describe, expect, it } from 'vitest';

import { plotOrRefuse, refusalOf } from '../app/di/uncharted';
import { FakeCharts } from './doubles';

const charts = new StarCharts(BUNDLED_CHARTS);

describe('plotOrRefuse', () => {
  it('answers the course for a charted star', () => {
    expect(plotOrRefuse(charts, 'Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
  });

  it('answers the text of UnchartedStarError for an uncharted star', () => {
    const text = explain(
      new UnchartedStarError({ star: 'V', charted: charts.stars() }),
      { text: [shipText] },
    );
    expect(text?.fix).toContain('Kepler-442b');
    expect(plotOrRefuse(charts, 'V')).toEqual({
      refused: `${text?.message} Fix: ${text?.fix}`,
    });
  });

  it('throws an error that is not UnchartedStarError again', () => {
    const broken = {
      ...charts,
      plot() {
        throw new TypeError('the charts are corrupt');
      },
    } as unknown as StarCharts;
    expect(() => plotOrRefuse(broken, 'V')).toThrow('the charts are corrupt');
  });
});

describe('refusalOf', () => {
  it('gives the code, the message and the fix of the shipText pack', () => {
    const error = new UnchartedStarError({ star: 'Vega', charted: ['A', 'B'] });
    expect(refusalOf(error)).toEqual({
      code: 'MERIDIAN_UNCHARTED',
      message: "No star is charted as 'Vega'.",
      fix: 'plot a course to a charted star: A, B.',
    });
  });

  it('omits the fix when the text pack holds none', () => {
    const error = new NexusError('NO_TEXT', 'NoTextError', {});
    expect(refusalOf(error)).toEqual({
      code: 'NO_TEXT',
      message: error.message,
    });
  });
});

describe('FakeCharts', () => {
  it('throws UnchartedStarError for a star it does not hold, as INavCharts says', () => {
    expect(() => new FakeCharts().plot('Nowhere')).toThrow(UnchartedStarError);
    expect(new FakeCharts().plot('Vega')).toEqual({ to: 'Vega', heading: 11 });
  });
});
