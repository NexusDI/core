import { defineModule, provide } from '@nexusdi/core';
import { NAV_CHARTS } from '@nexusdi/federation-contracts';

import { StarCharts } from './star-charts';

/**
 * The contract module. A remote's section is loaded with `load()`, and a
 * loaded module sees only what it imports or what a global module exports.
 * A remote cannot import this module object, so `Tactical` is global.
 */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
  global: true,
});
