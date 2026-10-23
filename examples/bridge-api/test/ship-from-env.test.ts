import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { COMMAND_DESK } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect, it, vi } from 'vitest';

import {
  isDev,
  setupFromEnv,
  shellOrigins,
  shipFromEnv,
  stopOnSigterm,
} from '../src/ship-from-env';
import { FLIGHT_LOG } from '../src/ship/contracts';

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

describe('shipFromEnv', () => {
  it('hands its scopes to the flight recorder', async () => {
    vi.stubEnv('SIM_MODE', 'manual');
    vi.stubEnv('RELAY_URL', '');
    try {
      const scopes = nodeScopes();
      await using ship = await shipFromEnv(scopes);
      await using scope = await ship.createScope({
        request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
      });
      scopes.run(scope, () =>
        ship
          .get(COMMAND_DESK)
          .submit({ system: 'safety', action: 'close', door: 'airlock-outer' }),
      );
      expect(scope.get(FLIGHT_LOG).entries()).toEqual([
        'survey-7: closed airlock-outer',
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('isDev', () => {
  it('reads every NODE_ENV but production as development', () => {
    expect(isDev({})).toBe(true);
    expect(isDev({ NODE_ENV: 'development' })).toBe(true);
    expect(isDev({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('shellOrigins', () => {
  it("allows the shell's dev server when SHELL_ORIGIN is unset or empty", () => {
    expect(shellOrigins({})).toEqual(['http://localhost:4300']);
    expect(shellOrigins({ SHELL_ORIGIN: '' })).toEqual([
      'http://localhost:4300',
    ]);
  });

  it('reads a comma-separated SHELL_ORIGIN', () => {
    expect(
      shellOrigins({
        SHELL_ORIGIN: 'http://127.0.0.1:4330,http://localhost:4330',
      }),
    ).toEqual(['http://127.0.0.1:4330', 'http://localhost:4330']);
  });

  it('allows no origin in production, whatever SHELL_ORIGIN holds', () => {
    expect(
      shellOrigins({
        NODE_ENV: 'production',
        SHELL_ORIGIN: 'http://127.0.0.1:4330',
      }),
    ).toEqual([]);
  });
});

/**
 * A server double: records `close`, `closeIdleConnections` and
 * `closeAllConnections` in `order`.
 */
function fakeServer(order: string[], close: () => unknown = () => {}) {
  return Object.assign(new EventEmitter(), {
    close: () => {
      order.push('close');
      return close();
    },
    closeIdleConnections: () => order.push('idle'),
    closeAllConnections: () => order.push('all'),
  });
}

/** A shutdown controller that records its abort in `order`. */
function recordedShutdown(order: string[]): AbortController {
  const shutdown = new AbortController();
  shutdown.signal.addEventListener('abort', () => order.push('abort'));
  return shutdown;
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

describe('stopOnSigterm', () => {
  it('closes the server, then aborts the shutdown signal, once, on SIGTERM', () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    stopOnSigterm(fakeServer(order), recordedShutdown(order), { signals });
    expect(order).toEqual([]);
    signals.emit('SIGTERM');
    signals.emit('SIGTERM');
    expect(order).toEqual(['close', 'abort']);
  });

  it('lets a request in flight at SIGTERM finish before the server closes and the ship disposes', async () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    let release = () => {};
    const server = createServer((_, res) => {
      order.push('request');
      release = () => res.end('ok');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    // The entries dispose the ship once the server closes.
    const disposed = once(server, 'close').then(() => order.push('dispose'));
    stopOnSigterm(server, recordedShutdown(order), { signals });

    const answer = fetch(`http://127.0.0.1:${port}/`);
    await vi.waitFor(() => expect(order).toEqual(['request']));
    signals.emit('SIGTERM');
    await nextTurn();
    expect(order).toEqual(['request', 'abort']);

    release();
    expect((await answer).status).toBe(200);
    await disposed;
    expect(order).toEqual(['request', 'abort', 'dispose']);
  });

  it('closes the idle connections each time a response finishes after SIGTERM', async () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    const server = fakeServer(order);
    stopOnSigterm(server, new AbortController(), { signals });
    const before = new EventEmitter();
    const stream = new EventEmitter();
    server.emit('request', {}, before);
    server.emit('request', {}, stream);
    before.emit('finish');
    await nextTurn();
    expect(order).toEqual([]);

    signals.emit('SIGTERM');
    stream.emit('finish');
    await nextTurn();
    expect(order).toEqual(['close', 'idle']);

    // A request that starts after SIGTERM closes the idle ones when it finishes, too.
    const late = new EventEmitter();
    server.emit('request', {}, late);
    late.emit('finish');
    await nextTurn();
    expect(order).toEqual(['close', 'idle', 'idle']);
  });

  it('calls the close it is given in place of server.close()', () => {
    const order: string[] = [];
    const signals = new EventEmitter();
    stopOnSigterm(fakeServer(order), recordedShutdown(order), {
      signals,
      close: () => order.push('framework close'),
    });
    signals.emit('SIGTERM');
    expect(order).toEqual(['framework close', 'abort']);
  });

  it('closes every connection once the drain deadline passes', () => {
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      const signals = new EventEmitter();
      stopOnSigterm(fakeServer(order), new AbortController(), {
        signals,
        drain: 2_000,
      });
      signals.emit('SIGTERM');
      vi.advanceTimersByTime(1_999);
      expect(order).toEqual(['close']);
      vi.advanceTimersByTime(1);
      expect(order).toEqual(['close', 'all']);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('server already closed');
      },
    ],
    ['rejects', () => Promise.reject(new Error('server already closed'))],
  ])(
    'aborts the shutdown signal when close %s, and reports the error with exit code 1',
    async (_, close) => {
      const order: string[] = [];
      const signals = new EventEmitter();
      const report = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        stopOnSigterm(fakeServer([]), recordedShutdown(order), {
          signals,
          close,
        });
        signals.emit('SIGTERM');
        expect(order).toEqual(['abort']);
        await vi.waitFor(() =>
          expect(report).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'server already closed' }),
          ),
        );
        expect(process.exitCode).toBe(1);
      } finally {
        report.mockRestore();
        process.exitCode = undefined;
      }
    },
  );
});
