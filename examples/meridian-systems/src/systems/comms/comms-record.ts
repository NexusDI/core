import type { SystemRecord } from '../../simulation/contracts';

/** Comms at tick 0: the array on standby, no hail sent and none queued. */
export const COMMS_RECORD = {
  records: { comms: { status: 'standby', sent: null, messages: [] } },
  setpoints: { comms: { hail: false } },
} satisfies SystemRecord;
