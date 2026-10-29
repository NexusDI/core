import { describe, expect, it } from 'vitest';

import { WEAPONS_RECORD } from './weapons-record';

describe('WEAPONS_RECORD', () => {
  it('starts the mount idle and unarmed', () => {
    expect(WEAPONS_RECORD).toStrictEqual({
      records: {
        weapons: {
          status: 'idle',
          charge: 0,
          shots: 0,
          hits: 0,
          lastShot: null,
        },
      },
      setpoints: { weapons: { armed: false, range: null } },
    });
  });
});
