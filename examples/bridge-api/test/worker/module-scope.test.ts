import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { honoMissionRoutes } from '../../e2e/fixtures/mission-routes';
import { createBridge } from '../../src/entries/hono';
import offlineWorker from '../../src/entries/worker.offline';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { recorder } from './harness';

// Built at module scope, as src/entries/worker.offline.ts does, with a trace plugin
// so the test counts scopes.
const seen = recorder();
const ship = await Nexus.create(OfflineMeridian, { plugins: [seen.plugin] });
const scopes = nodeScopes();
const app = createBridge(ship, { scopes, mount: honoMissionRoutes(scopes) });

describe('the bridge API on workerd, built at module scope', () => {
  it('answers a course with a scope per request', async () => {
    const res = await app.request('/course/Kepler-442b', {
      headers: { 'x-mission-id': 'survey-7' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      course: { to: string };
      entries: string[];
    };
    expect(body.course.to).toBe('Kepler-442b');
    expect(body.entries.every((entry) => entry.startsWith('survey-7: '))).toBe(
      true,
    );
  });

  it('gives ten concurrent requests ten scopes and disposes each', async () => {
    const created = seen.count('scope:create');
    const disposed = seen.count('scope:dispose');
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(
          app.request('/course/Kepler-442b', {
            headers: { 'x-mission-id': `survey-${i}` },
          }),
        ).then((res) => res.text()),
      ),
    );
    expect(seen.count('scope:create') - created).toBe(10);
    expect(seen.count('scope:dispose') - disposed).toBe(10);
  });

  it('reads the request scope through nodeScopes() in a service', async () => {
    const res = await app.request('/mission', {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual({ id: 'survey-9' });
  });

  it('creates no scope for a route that resolves nothing', async () => {
    const created = seen.count('scope:create');
    expect((await app.request('/health')).status).toBe(200);
    expect(seen.count('scope:create')).toBe(created);
  });

  it('serves the module-scope entry, src/entries/worker.offline.ts', async () => {
    // The entry runs requests in nodeScopes(), so the flight recorder finds
    // the request's log and the door command answers its entry.
    const res = await offlineWorker.request('/commands', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mission-id': 'survey-3',
      },
      body: JSON.stringify({
        system: 'safety',
        action: 'open',
        door: 'bridge-habitat',
      }),
    });
    expect(await res.json()).toMatchObject({
      flightLog: ['survey-3: opened bridge-habitat'],
    });
  });

  it('serves the configured entry, src/entries/worker.ts, through the function form', async () => {
    // RELAY_URL is empty in both configs, so src/entries/worker.ts builds OfflineMeridian.
    const res = await SELF.fetch('https://bridge.test/course/Kepler-442b');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { course: { to: string } }).course.to).toBe(
      'Kepler-442b',
    );
  });
});
