import { describe, expect, it } from 'vitest';

import { COMMS_RECORD } from './comms-record';

describe('COMMS_RECORD', () => {
  it('starts the phased array on standby with no hail queued', () => {
    expect(COMMS_RECORD).toStrictEqual({
      records: { comms: { status: 'standby', sent: null, messages: [] } },
      setpoints: { comms: { hail: false } },
    });
  });
});
