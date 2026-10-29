import type { SystemRecord } from '../../simulation/contracts';

/** The weapons at tick 0: the mount idle with no charge and no shot, unarmed. */
export const WEAPONS_RECORD = {
  records: {
    weapons: { status: 'idle', charge: 0, shots: 0, hits: 0, lastShot: null },
  },
  setpoints: { weapons: { armed: false, range: null } },
} satisfies SystemRecord;
