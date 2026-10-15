import { Nexus } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridge } from '../../src/hono';
import { NAV_CHARTS, type INavCharts } from '../../src/ship/contracts';
import { DEFAULT_RELAY_URL, OfflineMeridian } from '../../src/ship/meridian';

// The charts the fetching factory returns once its download succeeds.
const offline = await Nexus.create(OfflineMeridian);
const charts: INavCharts = offline.get(NAV_CHARTS);

/** The function form over a graph whose NAV_CHARTS factory fetches. */
function fetchingShip() {
  return () =>
    createTestingContainer(OfflineMeridian)
      .override(NAV_CHARTS, {
        useFactory: async (): Promise<INavCharts> => {
          const res = await fetch(DEFAULT_RELAY_URL);
          if (!res.ok) throw new Error(`relay answered ${res.status}`);
          return charts;
        },
        deps: [],
      })
      .create();
}

const relayOk = () =>
  new Response('{}', { headers: { 'content-type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('the function form on workerd', () => {
  it('builds once on the first request and serves every later one', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => relayOk());
    const build = vi.fn(fetchingShip());
    const app = createBridge(build);
    const replies = await Promise.all(
      Array.from({ length: 10 }, () => app.request('/course/Kepler-442b')),
    );
    expect(replies.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(
      ((await (replies[0] as Response).json()) as { course: unknown }).course,
    ).toEqual(charts.plot('Kepler-442b'));
    expect(build).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('answers 503 to every request that awaited a cancelled build, then retries', async () => {
    // The first client aborts mid-build: workerd cancels the fetch that
    // belongs to its request, and the shared build rejects (spec 9.2).
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(
        new DOMException('The operation was aborted.', 'AbortError'),
      )
      .mockImplementation(async () => relayOk());
    const build = vi.fn(fetchingShip());
    const app = createBridge(build, { log: () => undefined }); // the 503 is the assertion

    const first = await Promise.all([
      app.request('/course/Kepler-442b'),
      app.request('/course/Kepler-442b'),
    ]);
    expect(first.map((r) => r.status)).toEqual([503, 503]);
    for (const res of first)
      expect(await res.text()).toBe('Service Unavailable');

    const retry = await app.request('/course/Kepler-442b');
    expect(retry.status).toBe(200);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
