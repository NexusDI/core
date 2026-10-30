import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems/charts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = { request(path: string): Response | Promise<Response> };

/** A fresh copy of src/entries/worker.ts, so its build cache starts empty. */
async function freshWorker(flag: string | undefined): Promise<Entry> {
  vi.resetModules();
  Reflect.set(env, 'SHIP_INTROSPECTION', flag);
  return (await import('../../src/entries/worker')).default as Entry;
}

const relayOk = () => Promise.resolve(Response.json(BUNDLED_CHARTS));

beforeEach(() => {
  Reflect.set(env, 'RELAY_URL', '');
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.set(env, 'SHIP_INTROSPECTION', undefined);
  Reflect.set(env, 'RELAY_URL', '');
});

describe('SHIP_INTROSPECTION on src/entries/worker.ts', () => {
  it('answers 404 on /graph and /profile when it is unset', async () => {
    const app = await freshWorker(undefined);
    expect((await app.request('/graph')).status).toBe(404);
    expect((await app.request('/profile')).status).toBe(404);
  });

  it("serves /graph and /profile when it is 'on'", async () => {
    const app = await freshWorker('on');
    const graph = await app.request('/graph');
    expect(graph.status).toBe(200);
    expect(await graph.json()).toHaveProperty('providers');
    const profile = await app.request('/profile');
    expect(profile.status).toBe(200);
    expect(await profile.json()).toHaveProperty('table');
  });

  it('answers 500 and logs the message for a bad value', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await freshWorker('yes');
    expect((await app.request('/graph')).status).toBe(500);
    expect((await app.request('/profile')).status).toBe(500);
    // The adapter answers a failed build with 503 on the ship routes.
    expect((await app.request('/course/Kepler-442b')).status).toBe(503);
    const lines = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(lines).toContain(
      "SHIP_INTROSPECTION is 'yes'. Set it to 'on' or 'off', or leave it unset to follow NODE_ENV.",
    );
  });

  it('retries a failed build on the next request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await freshWorker('yes');
    expect((await app.request('/graph')).status).toBe(500);
    Reflect.set(env, 'SHIP_INTROSPECTION', 'on');
    expect((await app.request('/graph')).status).toBe(200);
  });

  it('builds once for two concurrent first requests', async () => {
    Reflect.set(env, 'RELAY_URL', 'https://relay.test');
    const fetched = vi.spyOn(globalThis, 'fetch').mockImplementation(relayOk);
    const single = await freshWorker(undefined);
    await single.request('/health');
    await single.request('/course/Kepler-442b');
    const perBuild = fetched.mock.calls.length;
    expect(perBuild).toBeGreaterThan(0);

    fetched.mockClear();
    const app = await freshWorker(undefined);
    const replies = await Promise.all([
      app.request('/course/Kepler-442b'),
      app.request('/course/Kepler-442b'),
    ]);
    expect(replies.map((res) => res.status)).toEqual([200, 200]);
    expect(fetched).toHaveBeenCalledTimes(perBuild);
  });
});
