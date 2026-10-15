import { describe, expect, test as base } from 'vitest';

import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import { nexusFixtures } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

const MISSION = new Token<Mission | undefined>('Mission');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const realCharts: INavCharts = { plot: (to) => ({ to, heading: 0 }) };
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (request: NexusRequest) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(NAV_CHARTS, { useValue: realCharts }),
  ],
  exports: [MISSION, NAV_CHARTS],
});
const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };

describe('nexusFixtures', () => {
  const test = base.extend(
    nexusFixtures(Meridian, {
      setup: (builder) =>
        builder.override(NAV_CHARTS, { useValue: fakeCharts }),
    }),
  );

  test('gives test.extend a container with the setup', ({ nexus }) => {
    expect(nexus.get(NAV_CHARTS).plot('Kepler-442b').heading).toBe(42);
  });

  describe('with a request', () => {
    test.override('nexusRequest', survey);

    test('gives test.extend a scope of that container', ({ nexusScope }) => {
      expect(nexusScope.get(MISSION)).toEqual(survey.mission);
    });
  });
});
