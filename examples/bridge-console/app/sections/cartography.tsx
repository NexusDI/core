import { defineModule, provide } from '@nexusdi/core';
import { useService } from '@nexusdi/react';

import { Tactical } from '../bridge/tactical';
import { NAV_ROUTES, SectorRoutes } from '../navigation/navigation.module';

/**
 * The section the charts route loads in the browser, in its own chunk. It
 * imports Tactical, which the client graph already holds, so `load()` reads
 * the root's NAV_CHARTS.
 */
export const Cartography = defineModule({
  name: 'Cartography',
  imports: [Tactical],
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});

const SECTORS = ['Kepler-442b', 'Proxima-b', 'TRAPPIST-1e'];

/** The heading to each charted sector, read through the loaded section. */
export function StarMap() {
  const routes = useService(NAV_ROUTES);
  return (
    <ul>
      {SECTORS.map((sector) => {
        const route = routes.find(sector);
        return <li key={sector}>{`${route.to}: heading ${route.heading}`}</li>;
      })}
    </ul>
  );
}
