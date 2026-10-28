import { defineModule, provide } from '@nexusdi/core';

import { SUBSPACE_LINK } from '../comms/contracts';

import { NAV_CHARTS } from './contracts';
import { BUNDLED_CHARTS, StarCharts } from './star-charts';

/**
 * NAV_CHARTS downloaded over SUBSPACE_LINK: an async factory that does I/O.
 * Tactical imports no link of its own. It reads the one `Comms` exports, so
 * the graph checks only beside `Comms` in `meridianSystems()`.
 */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: StarCharts.download,
      deps: [SUBSPACE_LINK],
    }),
  ],
  exports: [NAV_CHARTS],
});

/** NAV_CHARTS over the bundled table: no I/O, so a Worker can build it at module scope. */
export const OfflineTactical = defineModule({
  name: 'OfflineTactical',
  providers: [
    provide(NAV_CHARTS, { useValue: new StarCharts(BUNDLED_CHARTS) }),
  ],
  exports: [NAV_CHARTS],
});
