import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommsOptions } from './contracts';
import { SubspaceRelay } from './subspace-relay';

const options = (relayUrl: string): CommsOptions => ({
  frequency: 1420,
  transport: 'relay',
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

  it('throws the status of a relay that refuses the channel', async () => {
    stubFetch(() => new Response(null, { status: 503 }));
    const relay = new SubspaceRelay(options('https://relay.test'));
    await expect(relay.receive('charts')).rejects.toThrow(
      'relay answered 503 for charts',
    );
  });
});
