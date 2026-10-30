import { describe, expect, it } from 'vitest';

import {
  introspectionFromEnv,
  isDev,
  port,
  setupFromEnv,
} from '../../src/env/env';

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

  it('reads an empty SIM_MODE and SIM_SEED as unset, as the app reads an empty RELAY_URL', () => {
    expect(setupFromEnv({ SIM_MODE: '', SIM_SEED: '' })).toEqual({
      sim: { seed: 7, dt: 0.5 },
      mode: 'live',
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

describe('isDev', () => {
  it('reads every NODE_ENV but production as development', () => {
    expect(isDev({})).toBe(true);
    expect(isDev({ NODE_ENV: 'development' })).toBe(true);
    expect(isDev({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('port', () => {
  it('reads PORT, or 3000 when it is unset', () => {
    expect(port({ PORT: '4211' })).toBe(4211);
    expect(port({})).toBe(3000);
  });
});

describe('introspectionFromEnv', () => {
  it('follows NODE_ENV on a Node entry when SHIP_INTROSPECTION is unset or empty', () => {
    expect(introspectionFromEnv({})).toBe(true);
    expect(introspectionFromEnv({ SHIP_INTROSPECTION: '' })).toBe(true);
    expect(introspectionFromEnv({ NODE_ENV: 'production' })).toBe(false);
  });

  it('reads on and off over NODE_ENV', () => {
    expect(
      introspectionFromEnv({
        NODE_ENV: 'production',
        SHIP_INTROSPECTION: 'on',
      }),
    ).toBe(true);
    expect(introspectionFromEnv({ SHIP_INTROSPECTION: 'off' })).toBe(false);
  });

  it('is off on a Worker entry when the variable is unset', () => {
    expect(introspectionFromEnv({}, { worker: true })).toBe(false);
    expect(
      introspectionFromEnv({ SHIP_INTROSPECTION: 'on' }, { worker: true }),
    ).toBe(true);
  });

  it('refuses any other value and quotes it', () => {
    expect(() => introspectionFromEnv({ SHIP_INTROSPECTION: 'yes' })).toThrow(
      "SHIP_INTROSPECTION is 'yes'. Set it to 'on' or 'off', or leave it unset to follow NODE_ENV.",
    );
  });
});
