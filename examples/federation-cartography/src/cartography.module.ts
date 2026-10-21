import { Token, defineModule, provide } from '@nexusdi/core';
import { NAV_CHARTS, type INavCharts } from '@nexusdi/federation-contracts';

/** Course lookups by sector, over the shell's star charts. */
export interface INavRoutes {
  find(sector: string): string;
}

export const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

/**
 * Reads this remote's copy of the contract's NAV_CHARTS. federation()
 * binds that copy to the one the shell's Tactical provides, by its key
 * `meridian/NavCharts`.
 */
export class SectorRoutes implements INavRoutes {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}

  find(sector: string): string {
    return `${sector}: heading ${this.charts.plot(sector).heading}`;
  }
}

/** The cartography station's section. The shell adds it with load(). */
export const Cartography = defineModule({
  name: 'Cartography',
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});
