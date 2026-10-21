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

/** A server double: records `close` and `closeIdleConnections` in `order`. */
function fakeServer(order: string[], close: () => unknown = () => {}) {
  return Object.assign(new EventEmitter(), {
    close: () => {
      order.push('close');
      return close();
    },
    closeIdleConnections: () => order.push('idle'),
  });
}

describe('stopOnSigterm', () => {
  it('closes the server, then disposes the ship once, on SIGTERM', async () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    const dispose = vi.fn(async () => {
      order.push('dispose');
    });
    stopOnSigterm(
      fakeServer(order),
      { [Symbol.asyncDispose]: dispose },
      { signals },
    );
    expect(order).toEqual([]);
    signals.emit('SIGTERM');
    signals.emit('SIGTERM');
    await vi.waitFor(() => expect(order).toEqual(['close', 'dispose']));
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('closes the idle connections each time a response finishes after SIGTERM', () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    const server = fakeServer(order);
    stopOnSigterm(
      server,
      { [Symbol.asyncDispose]: async () => {} },
      { signals },
    );
    const before = new EventEmitter();
    const stream = new EventEmitter();
    server.emit('request', {}, before);
    server.emit('request', {}, stream);
    before.emit('finish');
    expect(order).toEqual([]);

    signals.emit('SIGTERM');
    stream.emit('finish');
    expect(order).toEqual(['close', 'idle']);

    // A request that starts after SIGTERM closes the idle ones when it finishes, too.
    const late = new EventEmitter();
    server.emit('request', {}, late);
    late.emit('finish');
    expect(order).toEqual(['close', 'idle', 'idle']);
  });

  it('calls the close it is given in place of server.close()', () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    stopOnSigterm(
      fakeServer(order),
      { [Symbol.asyncDispose]: async () => {} },
      { signals, close: () => order.push('framework close') },
    );
    signals.emit('SIGTERM');
    expect(order).toEqual(['framework close']);
  });

  it('disposes the ship when close throws, and reports the error with exit code 1', async () => {
    const signals = new EventEmitter();
    const dispose = vi.fn(async () => {});
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('server already closed');
    try {
      stopOnSigterm(
        fakeServer([], () => {
          throw boom;
        }),
        { [Symbol.asyncDispose]: dispose },
        { signals },
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
