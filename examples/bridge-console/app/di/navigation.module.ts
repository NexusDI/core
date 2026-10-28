import { defineModule, provide, Token } from '@nexusdi/core';
import {
  NAV_CHARTS,
  type Course,
  type INavCharts,
} from '@nexusdi/meridian-systems/charts';

import { Tactical } from './tactical.module';

export interface INavRoutes {
  find(sector: string): Course;
}
export const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class SectorRoutes implements INavRoutes {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    return this.charts.plot(sector);
  }
}

/** NAV_ROUTES over the charts, which both the Navigation and the Cartography section bind. */
export const sectorRoutes = provide(NAV_ROUTES, { useClass: SectorRoutes });

/**
 * The section the sectors route loads on its first request, with di.load.
 * A loaded module sees only what it imports, so it imports
 * Tactical, and `load()` finds that module object already in the graph.
 */
export const Navigation = defineModule({
  name: 'Navigation',
  imports: [Tactical],
  providers: [sectorRoutes],
  exports: [NAV_ROUTES],
});
