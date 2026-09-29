import { defineModule, provide } from '@nexusdi/core';

import { COMPUTER, NAV_CHARTS } from './meridian.module.js';

class ShipComputer {
  static deps = [NAV_CHARTS];
  constructor(charts) {
    this.charts = charts;
  }
}

// Navigation is not imported, so NavCharts is missing.
export default defineModule({
  name: 'Meridian',
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});
