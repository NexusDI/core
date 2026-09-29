import { Token, defineModule, provide } from '@nexusdi/core';

export const NAV_CHARTS = new Token('NavCharts');
export const COMPUTER = new Token('ShipComputer');

class StellarCharts {
  plot(to) {
    return `course to ${to}`;
  }
}
class ShipComputer {
  static deps = [NAV_CHARTS];
  constructor(charts) {
    this.charts = charts;
  }
}

export const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
  exports: [NAV_CHARTS],
});

export const Meridian = defineModule({
  name: 'Meridian',
  imports: [Navigation],
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});

export default Meridian;
