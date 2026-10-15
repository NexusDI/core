import { nexusFixtures } from '@nexusdi/vitest';
import { test as base } from 'vitest';

import { FLIGHT_LOG, NAV_CHARTS } from '../src/ship/contracts';
import { Meridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';
import { FakeCharts, MemoryFlightLog } from './doubles';

export const test = base.extend(
  nexusFixtures(Meridian, {
    setup: (builder) =>
      builder
        .override(NAV_CHARTS, { useClass: FakeCharts })
        .override(FLIGHT_LOG, { useClass: MemoryFlightLog }),
    create: { plugins: bridgePlugins() },
  }),
);
