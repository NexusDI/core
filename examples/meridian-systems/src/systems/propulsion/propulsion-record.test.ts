import { describe, expect, it } from 'vitest';

import { PROPULSION_RECORD } from './propulsion-record';

describe('PROPULSION_RECORD', () => {
  it('starts the drive at rest with the throttle closed', () => {
    expect(PROPULSION_RECORD).toStrictEqual({
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
    });
  });
});
