import type { SystemRecord } from '../../simulation/contracts';

/** The helm at tick 0: at rest on heading 0. */
export const HELM_RECORD = {
  records: { helm: { attitude: 0, rate: 0, torque: 0 } },
  setpoints: { helm: { heading: 0 } },
} satisfies SystemRecord;
