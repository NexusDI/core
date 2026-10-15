import { defineModule, provide } from '@nexusdi/core';

import charts from './charts.json' with { type: 'json' };
import { Comms } from './comms.module';
import { NAV_CHARTS, SUBSPACE_LINK } from './contracts';
import { StarCharts } from './star-charts';

/** NAV_CHARTS downloaded over the relay at relayUrl: an async factory that does I/O. */
export function tactical(relayUrl: string) {
  return defineModule({
    name: 'Tactical',
    imports: [Comms.forRoot({ frequency: 1420, transport: 'relay', relayUrl })],
    providers: [
      provide(NAV_CHARTS, {
        useFactory: async (link) => StarCharts.download(link),
        deps: [SUBSPACE_LINK],
      }),
    ],
    exports: [NAV_CHARTS],
  });
}

/** NAV_CHARTS over the bundled table: no I/O, so a Worker can build it at module scope. */
export const OfflineTactical = defineModule({
  name: 'OfflineTactical',
  providers: [provide(NAV_CHARTS, { useValue: new StarCharts(charts) })],
  exports: [NAV_CHARTS],
});
