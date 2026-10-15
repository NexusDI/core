import { defineModule, provide } from '@nexusdi/core';

import { NAV_CHARTS, type INavCharts } from '../bridge/contracts';

class StarCharts implements INavCharts {
  heading() {
    return 42;
  }
}

export const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
