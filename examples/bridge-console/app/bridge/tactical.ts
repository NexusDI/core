import { defineModule, provide } from '@nexusdi/core';

import charts from './charts.json';
import { NAV_CHARTS, type Course, type INavCharts } from './contracts';

/** The star charts over the table in charts.json, a copy of bridge-api's. */
class ChartTable implements INavCharts {
  readonly #headings: Readonly<Record<string, number>> = charts;
  plot(to: string): Course {
    return { to, heading: this.#headings[to] ?? 0 };
  }
}

/** The console's Tactical: NAV_CHARTS with no I/O, so the browser builds it too. */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: ChartTable })],
  exports: [NAV_CHARTS],
});
