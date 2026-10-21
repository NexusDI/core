import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { isDev, setupFromEnv, stopOnSigterm } from '../src/ship-from-env';

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

describe('stopOnSigterm', () => {
  it('closes the server, then disposes the ship once, on SIGTERM', async () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    const dispose = vi.fn(async () => {
      order.push('dispose');
    });
    stopOnSigterm(
      () => order.push('close'),
      { [Symbol.asyncDispose]: dispose },
      signals,
    );
    expect(order).toEqual([]);
    signals.emit('SIGTERM');
    signals.emit('SIGTERM');
    await vi.waitFor(() => expect(order).toEqual(['close', 'dispose']));
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the ship when close throws, and reports the error with exit code 1', async () => {
    const signals = new EventEmitter();
    const dispose = vi.fn(async () => {});
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('server already closed');
    try {
      stopOnSigterm(
        () => {
          throw boom;
        },
        { [Symbol.asyncDispose]: dispose },
        signals,
      );
      signals.emit('SIGTERM');
      await vi.waitFor(() => expect(report).toHaveBeenCalledWith(boom));
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    } finally {
      report.mockRestore();
      process.exitCode = undefined;
    }
  });
});
