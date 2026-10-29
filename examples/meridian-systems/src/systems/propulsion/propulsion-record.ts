import type { SystemRecord } from '../../simulation/contracts';

/** The main drive at tick 0: at rest, with the throttle closed. */
export const PROPULSION_RECORD = {
  records: {
    drive: {
      thrust: 0,
      massFlow: 0,
      acceleration: 0,
      velocity: 0,
      distance: 0,
    },
  },
  setpoints: { drive: { throttle: 0 } },
} satisfies SystemRecord;
