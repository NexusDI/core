import { defineModule, provide } from '@nexusdi/core';
import {
  BUNDLED_CHARTS,
  NAV_CHARTS,
  StarCharts,
} from '@nexusdi/meridian-systems/charts';

/** The library's star charts over the table the ship carries. */
class ChartTable extends StarCharts {
  constructor() {
    super(BUNDLED_CHARTS);
  }
}

/** The console's Tactical: NAV_CHARTS with no I/O, so the browser builds it too. */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: ChartTable })],
  exports: [NAV_CHARTS],
});
