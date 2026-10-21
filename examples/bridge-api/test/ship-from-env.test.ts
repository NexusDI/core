import { describe, expect, it } from 'vitest';

import { setupFromEnv } from '../src/ship-from-env';

describe('setupFromEnv', () => {
  it('runs a live ship on seed 7 at dt 0.5 when no variable is set', () => {
    expect(setupFromEnv({})).toEqual({
      sim: { seed: 7, dt: 0.5 },
      mode: 'live',
    });
  });

  it('reads the mode from SIM_MODE and the seed from SIM_SEED', () => {
    expect(setupFromEnv({ SIM_MODE: 'manual', SIM_SEED: '42' })).toEqual({
      sim: { seed: 42, dt: 0.5 },
      mode: 'manual',
    });
  });

  it.each(['-1', '1.5', 'abc', '4294967296'])(
    'refuses SIM_SEED=%s and names the accepted values',
    (seed) => {
      expect(() => setupFromEnv({ SIM_SEED: seed })).toThrow(
        expect.objectContaining({
          constructor: Error,
          message: expect.stringMatching(/SIM_SEED.*0.*4294967295/s),
        }),
      );
    },
  );

  it('refuses SIM_MODE=fast and names the accepted values', () => {
    expect(() => setupFromEnv({ SIM_MODE: 'fast' })).toThrow(
      expect.objectContaining({
        constructor: Error,
        message: expect.stringMatching(/SIM_MODE.*'live'.*'manual'/s),
      }),
    );
  });
});
