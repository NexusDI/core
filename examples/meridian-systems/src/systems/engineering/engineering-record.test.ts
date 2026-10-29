import { describe, expect, it } from 'vitest';

import { ENGINEERING_RECORD } from './engineering-record';
import { LITHIUM_LOOP } from './engineering-model';

describe('ENGINEERING_RECORD', () => {
  it('starts the reactor cold, the loop at standby and the router with no loads', () => {
    expect(ENGINEERING_RECORD).toStrictEqual({
      records: {
        reactor: { level: 0, thermal: 0, electric: 0, tripped: false },
        coolant: { temperature: LITHIUM_LOOP.standby },
        power: { output: 0, loads: [], shed: [] },
      },
      setpoints: { reactor: { throttle: 0 }, shields: { raised: false } },
    });
  });
});
