import { Nexus, type TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { isNexusError } from '@nexusdi/core';
import { SHIP_STATE } from '@nexusdi/meridian-systems';
import { expect, it } from 'vitest';

import { createBridge } from '../../src/entries/hono';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { events } from '../sse';

it('on shutdown the stream sends event: offline, the telemetry feed disposes before the reactor scram, and a later request answers 503 with NEXUS_DISPOSED', async () => {
  const traced: TraceEvent[] = [];
  const logged: unknown[] = [];
  const ship = await Nexus.create(OfflineMeridian, {
    plugins: [...bridgePlugins(), trace((event) => traced.push(event))],
  });
  // stopOnSigterm aborts this signal on SIGTERM, before the ship disposes.
  const shutdown = new AbortController();
  const bridge = createBridge(ship, {
    shutdown: shutdown.signal,
    log: (error) => logged.push(error),
  });
  ship.get(SHIP_STATE).queue({ reactor: { throttle: 1 } });

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

  const late = await bridge.request('/course/Kepler-442b');
  expect(late.status).toBe(503);
  expect(logged).toHaveLength(1);
  expect(isNexusError(logged[0], 'NEXUS_DISPOSED')).toBe(true);
});
