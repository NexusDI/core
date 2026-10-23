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
