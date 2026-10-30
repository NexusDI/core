import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubspaceLinkOptions } from './contracts';
import { SubspaceRelay } from './subspace-relay';

const options = (relayUrl: string): SubspaceLinkOptions => ({
  frequency: 1420,
  relayUrl,
});

/** Stubs fetch to answer `response`, and returns the URLs it saw. */
function stubFetch(response: () => Response): string[] {
  const fetched: string[] = [];
  vi.stubGlobal('fetch', (url: URL | string) => {
    fetched.push(String(url));
    return Promise.resolve(response());
  });
  return fetched;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubs fetch to record the method and URL of each call. */
function stubCalls(
  response: () => Response = () => new Response(null, { status: 204 }),
): string[] {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: URL | string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    return Promise.resolve(response());
  });
  return calls;
}

describe('SubspaceRelay handshake and sign-off', () => {
  it('opens the link with a POST to handshake on its frequency in onInit', async () => {
    const calls = stubCalls();
    await new SubspaceRelay(options('https://relay.test')).onInit();
    expect(calls).toEqual(['POST https://relay.test/handshake?frequency=1420']);
  });

  it('signs off with a POST of the report to signoff', async () => {
    const bodies: string[] = [];
    const calls: string[] = [];
    vi.stubGlobal('fetch', (url: URL | string, init: RequestInit) => {
      calls.push(`${init.method} ${String(url)}`);
      bodies.push(String(init.body));
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await new SubspaceRelay(options('https://relay.test')).signOff({
      tick: 12,
      output: 3e6,
    });
    expect(calls).toEqual(['POST https://relay.test/signoff?frequency=1420']);
    expect(bodies).toEqual([JSON.stringify({ tick: 12, output: 3e6 })]);
  });

  it('fails onInit with the status of a relay that refuses the handshake', async () => {
    stubCalls(() => new Response(null, { status: 403 }));
    await expect(
      new SubspaceRelay(options('https://relay.test')).onInit(),
    ).rejects.toThrow(new Error('The relay answered 403 for handshake.'));
  });

  it('fails onInit with MERIDIAN_RELAY when the relay does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const relay = new SubspaceRelay({
      ...options('https://relay.test'),
      relayTimeout: 20,
    });
    await expect(relay.onInit()).rejects.toMatchObject({
      code: 'MERIDIAN_RELAY',
      reason: 'timeout',
      channel: 'handshake',
    });
  });
});

describe('SubspaceRelay', () => {
  it.each(['https://relay.test', 'https://relay.test/'])(
    'asks %s for the channel on its frequency',
    async (relayUrl) => {
      const fetched = stubFetch(() => Response.json({ 'Kepler-442b': 42 }));
      const relay = new SubspaceRelay(options(relayUrl));
      expect(await relay.receive('charts')).toEqual({ 'Kepler-442b': 42 });
      expect(fetched).toEqual(['https://relay.test/charts?frequency=1420']);
    },
  );

  it('passes fetch a signal that times out after relayTimeout, 5000 ms by default', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', (_url: URL, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return Promise.resolve(Response.json({}));
    });
    await new SubspaceRelay(options('https://relay.test')).receive('charts');
    await new SubspaceRelay({
      ...options('https://relay.test'),
      relayTimeout: 50,
    }).receive('charts');
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(false);
    await new Promise((done) => {
      signals[1].addEventListener('abort', done);
    });
    expect(signals[1].reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('throws MERIDIAN_RELAY when the relay does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const relay = new SubspaceRelay({
      ...options('https://relay.test'),
      relayTimeout: 20,
    });
    await expect(relay.receive('charts')).rejects.toMatchObject({
      code: 'MERIDIAN_RELAY',
      reason: 'timeout',
      channel: 'charts',
      expected: 'within 20 ms',
    });
  });

  it('rethrows a network failure as the TypeError fetch raised', async () => {
    const failure = new TypeError('fetch failed');
    vi.stubGlobal('fetch', () => Promise.reject(failure));
    const relay = new SubspaceRelay(options('https://relay.test'));
    const error = await relay.receive('charts').then(
      () => undefined,
      (refused: unknown) => refused,
    );
    expect(error).toBe(failure);
    expect(error).not.toMatchObject({ code: 'MERIDIAN_RELAY' });
  });

  it('throws the status of a relay that refuses the channel', async () => {
    stubFetch(() => new Response(null, { status: 503 }));
    const relay = new SubspaceRelay(options('https://relay.test'));
    await expect(relay.receive('charts')).rejects.toThrow(
      new Error('The relay answered 503 for charts.'),
    );
  });
});
