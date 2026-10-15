import { defineModule, provide, Token, type ModuleRef } from '@nexusdi/core';
import {
  NAV_CHARTS,
  type Course,
  type INavCharts,
} from '@nexusdi/bridge-api/contracts';

interface INavRoutes {
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

/**
 * The section the sectors route loads on its first request, with di.load
 * (spec 3.9). A loaded module sees only what it imports, so it imports the
 * charts module the root holds, and `load()` finds that module already in
 * the graph.
 */
export function navigation(charts: ModuleRef) {
  return defineModule({
    name: 'Navigation',
    imports: [charts],
    providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
    exports: [NAV_ROUTES],
  });
}
