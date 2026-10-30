import { BUNDLED_CHARTS, StarCharts } from '@nexusdi/meridian-systems/charts';
import { describe, expect, it } from 'vitest';

import { answerCourse } from '../src/bridge/course';
import type { INavCharts } from '../src/ship/contracts';

import { FakeFlightLog } from './doubles';

describe('answerCourse', () => {
  it('answers 404 for an uncharted star and keeps the plot in the flight log', () => {
    const log = new FakeFlightLog();
    const reply = answerCourse(new StarCharts(BUNDLED_CHARTS), log, 'Vega');
    expect(reply.status).toBe(404);
    expect(log.entries()).toEqual(['plotting Vega']);
  });

  it('throws an error that is not UnchartedStarError again, for the 500 path', () => {
    const broken: INavCharts = {
      has: () => true,
      plot() {
        throw new TypeError('the charts are corrupt');
      },
      stars: () => [],
    };
    expect(() => answerCourse(broken, new FakeFlightLog(), 'Vega')).toThrow(
      'the charts are corrupt',
    );
  });
});
