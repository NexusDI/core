import { Token, defineModule, provide } from '@nexusdi/core';

export interface INavCharts {
  plot(to: string): string;
}
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');

enum Units {
  Parsec = 'pc',
}

class StellarCharts implements INavCharts {
  constructor(private readonly units: Units = Units.Parsec) {}
  plot(to: string): string {
    return `course to ${to} in ${this.units}`;
  }
}

export const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_CHARTS, { useFactory: () => new StellarCharts(), deps: [] }),
  ],
  exports: [NAV_CHARTS],
});
