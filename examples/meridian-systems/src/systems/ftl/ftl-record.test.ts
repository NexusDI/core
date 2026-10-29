import { describe, expect, it } from 'vitest';

import { FTL_RECORD } from './ftl-record';

describe('FTL_RECORD', () => {
  it('starts the drive offline at Sol, uncharged and unarmed', () => {
    expect(FTL_RECORD).toStrictEqual({
      records: {
        ftl: { status: 'offline', charge: 0, sector: 'Sol', jumped: null },
      },
      setpoints: { ftl: { armed: false, jump: null } },
    });
  });
});
