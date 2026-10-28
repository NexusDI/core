import {
  DECK_PLAN,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, vi } from 'vitest';

import { servers } from '../../e2e/servers';
import { createBridge as honoBridge } from '../../src/entries/hono';
import { SIM_DRIVER } from '../../src/ship/contracts';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { RecordingFeed } from '../doubles';
import { test } from '../fixtures';
import { events } from '../sse';
import { FRAMEWORKS } from '../support';

test('GET /telemetry streams a frame now and one per tick from Hono', async ({
  nexus,
}) => {
  const res = await honoBridge(nexus).request('/telemetry');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  expect(res.headers.get('cache-control')).toContain('no-transform');
  const stream = events(res);
  expect(await stream.tick()).toBe(0);
  nexus.get(SIM_DRIVER).advance(1);
  expect(await stream.tick()).toBe(1);
  await stream.cancel();
});

test('cancelling the Hono body unsubscribes from the feed', async ({
  nexus,
}) => {
  const feed = new RecordingFeed(
    readShip(nexus.get(SHIP_STATE).snapshot(), nexus.get(DECK_PLAN)),
  );
  await using ship = await createTestingContainer(OfflineMeridian)
    .override(TELEMETRY, { useValue: feed })
    .create();
  const res = await honoBridge(ship).request('/telemetry');
  const stream = events(res);
  expect(await stream.tick()).toBe(0);
  expect(feed.sinks.size).toBe(1);
  await stream.cancel();
  await vi.waitFor(() => expect(feed.sinks.size).toBe(0), { timeout: 5_000 });
});

describe.each(FRAMEWORKS)('GET /telemetry on %s over a socket', (framework) => {
  test('a client abort unsubscribes from the feed', async ({ nexus }) => {
    const feed = new RecordingFeed(
      readShip(nexus.get(SHIP_STATE).snapshot(), nexus.get(DECK_PLAN)),
    );
    await using ship = await createTestingContainer(OfflineMeridian)
      .override(TELEMETRY, { useValue: feed })
      .create();
    const bridge = await servers[framework](ship);
    try {
      const abort = new AbortController();
      const res = await fetch(`${bridge.url}/telemetry`, {
        signal: abort.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(await events(res).tick()).toBe(0);
      expect(feed.sinks.size).toBe(1);
      abort.abort();
      await vi.waitFor(() => expect(feed.sinks.size).toBe(0), {
        timeout: 5_000,
      });
    } finally {
      await bridge.close();
    }
  });
});
