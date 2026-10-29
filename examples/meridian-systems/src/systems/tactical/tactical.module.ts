import { defineModule, optional, provide } from '@nexusdi/core';

import { SUBSPACE_LINK } from '../comms/contracts';

import { NAV_CHARTS } from './contracts';
import { StarCharts } from './star-charts';

/**
 * NAV_CHARTS from a factory. With the global `SubspaceLink` the factory
 * downloads the charts over the link at startup, and without it the factory
 * reads the table the ship carries with no I/O.
 */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: StarCharts.chart,
      deps: [optional(SUBSPACE_LINK)],
    }),
  ],
  exports: [NAV_CHARTS],
});
