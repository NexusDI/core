import { isNexusError, type TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { createTestingContainer } from '@nexusdi/testing';
import {
  SHIP_STATE,
  SUBSPACE_LINK,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';
import { expect, it } from 'vitest';

import { createBridge } from '../../src/entries/hono';
import { DEFAULT_RELAY_URL, meridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { FixedLink } from '../doubles';
import { events } from '../sse';

it('on shutdown the stream sends event: offline, the relay sign-off and the telemetry feed go before the reactor scram, and a later request answers 503 with NEXUS_DISPOSED', async () => {
  const traced: TraceEvent[] = [];
  const logged: unknown[] = [];
  const ship = await createTestingContainer(meridian(DEFAULT_RELAY_URL))
    .override(SUBSPACE_LINK, { useClass: FixedLink })
    .create({
      plugins: [...bridgePlugins(), trace((event) => traced.push(event))],
    });
  const link = ship.get(SUBSPACE_LINK) as FixedLink;
  // stopOnSigterm aborts this signal on SIGTERM, before the ship disposes.
  const shutdown = new AbortController();
  const bridge = createBridge(ship, {
    shutdown: shutdown.signal,
    log: (error) => logged.push(error),
  });
  ship.get(SHIP_STATE).queue({ reactor: { throttle: 1 } });
  // The reactor needs ticks to put out power for the sign-off.
  ship.get(TICK_LOOP).advance(20);

  // The relay signs off only on dispose.
  expect(link.signOffs).toEqual([]);

  const stream = events(await bridge.request('/telemetry'));
  expect((await stream.next())?.event).toBe('snapshot');
  shutdown.abort();
  let last = await stream.next();
  while (last?.event === 'snapshot') last = await stream.next();
  expect(last).toEqual({ event: 'offline', data: 'ship offline' });

  await ship[Symbol.asyncDispose]();
  const disposed = traced.flatMap((event) =>
    event.type === 'dispose:instance' ? [event.token] : [],
  );
  expect(disposed.indexOf('TelemetryFeed')).toBeGreaterThanOrEqual(0);
  expect(disposed.indexOf('TelemetryFeed')).toBeLessThan(
    disposed.indexOf('ReactorCore'),
  );

  // The array signs off while the reactor still runs, then the reactor scrams.
  expect(link.signOffs).toEqual([
    { tick: expect.any(Number), output: expect.any(Number) },
  ]);
  expect(link.signOffs[0].output).toBeGreaterThan(0);
  expect(disposed.indexOf('CommsArray')).toBeGreaterThanOrEqual(0);
  expect(disposed.indexOf('CommsArray')).toBeLessThan(
    disposed.indexOf('ReactorCore'),
  );

  const late = await bridge.request('/course/Kepler-442b');
  expect(late.status).toBe(503);
  expect(logged).toHaveLength(1);
  expect(isNexusError(logged[0], 'NEXUS_DISPOSED')).toBe(true);
});
