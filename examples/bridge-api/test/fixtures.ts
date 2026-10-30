import { SUBSPACE_LINK } from '@nexusdi/meridian-systems';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

import { FLIGHT_LOG, NAV_CHARTS } from '../src/ship/contracts';
import { Meridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FixedCharts, FakeFlightLog, FixedLink } from './doubles';

export const test = nexusTest(base, Meridian, {
  setup: (builder) =>
    builder
      .override(SUBSPACE_LINK, { useClass: FixedLink })
      .override(NAV_CHARTS, { useClass: FixedCharts })
      .override(FLIGHT_LOG, { useClass: FakeFlightLog }),
  create: { plugins: bridgePlugins() },
});
