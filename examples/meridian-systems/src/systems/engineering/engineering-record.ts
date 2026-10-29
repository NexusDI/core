import type { SystemRecord } from '../../simulation/contracts';

import { LITHIUM_LOOP } from './engineering-model';

/**
 * Engineering at tick 0: the reactor cold, the loop at the louvres' standby
 * and the router with no loads, since the router lists each load from tick
 * 1 on, as it allocates it.
 */
export const ENGINEERING_RECORD = {
  records: {
    reactor: { level: 0, thermal: 0, electric: 0, tripped: false },
    coolant: { temperature: LITHIUM_LOOP.standby },
    power: { output: 0, loads: [], shed: [] },
  },
  setpoints: { reactor: { throttle: 0 }, shields: { raised: false } },
} satisfies SystemRecord;
