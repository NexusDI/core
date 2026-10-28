import { defineModule } from '@nexusdi/core';

import { NAV_ROUTES, sectorRoutes } from './navigation.module';
import { Tactical } from './tactical.module';

/**
 * The section the charts route loads in the browser, in its own chunk. It
 * imports Tactical, which the client graph already holds, so `load()` reads
 * the root's NAV_CHARTS.
 */
export const Cartography = defineModule({
  name: 'Cartography',
  imports: [Tactical],
  providers: [sectorRoutes],
  exports: [NAV_ROUTES],
});
