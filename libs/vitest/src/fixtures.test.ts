import { describe, expect, test as base } from 'vitest';

import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

import { nexusFixtures } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

const MISSION = new Token<Mission | undefined>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class MemoryFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

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
    provide(FLIGHT_LOG, { useClass: MemoryFlightLog, lifetime: 'scoped' }),
    provide(NAV_CHARTS, { useValue: realCharts }),
  ],
  exports: [MISSION, FLIGHT_LOG, NAV_CHARTS],
});

const events: TraceEvent[] = [];
const test = base.extend(
  nexusFixtures(Meridian, {
    setup: (builder) => builder.override(NAV_CHARTS, { useValue: fakeCharts }),
    create: { plugins: [trace((event) => events.push(event))] },
  }),
);

const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };

describe('nexusFixtures', () => {
  test('applies the setup to the container', ({ nexus }) => {
    expect(nexus.get(NAV_CHARTS).plot('Kepler-442b').heading).toBe(42);
  });

  describe('with a request', () => {
    test.override('nexusRequest', survey);

    test('passes nexusRequest to REQUEST in nexusScope', ({ nexusScope }) => {
      expect(nexusScope.get(MISSION)).toEqual(survey.mission);
    });

    test('gives each scope its own scoped instance', async ({
      nexus,
      nexusScope,
    }) => {
      nexusScope.get(FLIGHT_LOG).record('launch');
      await using other = await nexus.createScope({ request: survey });
      expect(other.get(FLIGHT_LOG).entries()).toEqual([]);
    });
  });

  describe('with an overridden setup', () => {
    test.override('nexusSetup', [
      (builder) => builder.override(NAV_CHARTS, { useValue: realCharts }),
    ]);

    test('replaces the file setup for the suite', ({ nexus }) => {
      expect(nexus.get(NAV_CHARTS).plot('Kepler-442b').heading).toBe(0);
    });
  });

  describe('after each test', () => {
    test.override('nexusRequest', survey);

    const disposals = () =>
      events
        .map((event) => event.type)
        .filter((type) => type === 'scope:dispose' || type === 'dispose');

    test('disposes the scope before the container', async ({ nexusScope }) => {
      nexusScope.get(FLIGHT_LOG);
      events.length = 0;
    });

    test('saw the previous test dispose its scope, then its container', () => {
      expect(disposals()).toEqual(['scope:dispose', 'dispose']);
    });

    test.fails('fails after it resolves a scoped service', ({ nexusScope }) => {
      nexusScope.get(FLIGHT_LOG);
      events.length = 0;
      throw new Error('sector not charted');
    });

    test('saw the failed test dispose its scope, then its container', () => {
      expect(disposals()).toEqual(['scope:dispose', 'dispose']);
    });
  });
});

const fileTest = base.extend(
  nexusFixtures(Meridian, { containerScope: 'file' }),
);
let first: unknown;

describe('containerScope: file', () => {
  fileTest('builds the container for the first test', ({ nexus }) => {
    first = nexus;
  });
  fileTest('shares it with the next test in the file', ({ nexus }) => {
    expect(nexus).toBe(first);
  });
});
