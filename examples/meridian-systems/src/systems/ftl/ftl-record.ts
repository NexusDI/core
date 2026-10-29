import type { SystemRecord } from '../../simulation/contracts';

import { HOME_SECTOR } from './ftl-model';

/**
 * The FTL drive's part of the snapshot from the tick it loads: offline at
 * the home sector with no charge, unarmed. `JumpDrive` registers it with
 * `SHIP_STATE`, since a module that `load()` adds cannot contribute to
 * `SHIP_RECORDS`.
 */
export const FTL_RECORD = {
  records: {
    ftl: { status: 'offline', charge: 0, sector: HOME_SECTOR, jumped: null },
  },
  setpoints: { ftl: { armed: false, jump: null } },
} satisfies SystemRecord;
