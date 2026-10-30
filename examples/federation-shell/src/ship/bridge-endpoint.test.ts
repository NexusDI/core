import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeBridgeEndpoint } from './bridge-endpoint';

const BRIDGE = { url: 'http://127.0.0.1:4331/' };

describe('RuntimeBridgeEndpoint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads /bridge.json once and keeps the answer', async () => {
    const fetch = vi.fn(async () => Response.json(BRIDGE));
    vi.stubGlobal('fetch', fetch);
    const endpoint = new RuntimeBridgeEndpoint();

    expect(String(await endpoint.url())).toBe(BRIDGE.url);
    expect(String(await endpoint.url())).toBe(BRIDGE.url);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/bridge.json');
  });

  it('keeps the path of a url that has no trailing slash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ url: 'http://127.0.0.1:4331/api' })),
    );
    const url = await new RuntimeBridgeEndpoint().url();

    expect(String(url)).toBe('http://127.0.0.1:4331/api/');
    expect(String(new URL('commands', url))).toBe(
      'http://127.0.0.1:4331/api/commands',
    );
  });

  it('adds the slash to the path of a url that has a query or a hash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ url: 'http://127.0.0.1:4331/api?key=1#top' }),
      ),
    );
    const url = await new RuntimeBridgeEndpoint().url();

    expect(url.pathname).toBe('/api/');
    expect(url.search).toBe('?key=1');
    expect(url.hash).toBe('#top');
  });

  it('reads /bridge.json again after a failed read', async () => {
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ url: 42 }))
      .mockResolvedValue(Response.json(BRIDGE));
    vi.stubGlobal('fetch', fetch);
    const endpoint = new RuntimeBridgeEndpoint();

    await expect(endpoint.url()).rejects.toThrow('Failed to fetch');
    await expect(endpoint.url()).rejects.toThrow('/bridge.json answered 404');
    await expect(endpoint.url()).rejects.toThrow('/bridge.json holds no url');
    expect(String(await endpoint.url())).toBe(BRIDGE.url);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe('public/bridge.json', () => {
  it('names bridge-api on its own port, 3000, as the console does', () => {
    const file = resolve(process.cwd(), 'public/bridge.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      url: 'http://localhost:3000/',
    });
  });
});
