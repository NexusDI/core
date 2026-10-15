import type { Scope } from '@nexusdi/core';
import { nexus, type ContainerSource, type NexusLog } from '@nexusdi/hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';

import { UNCHARTED } from './bridge/uncharted';
import { FLIGHT_LOG, MISSION, NAV_CHARTS } from './ship/contracts';

export interface BridgeOptions {
  scopes?: {
    run<R>(scope: Scope, fn: () => R): R;
    current?(): Scope | undefined;
  };
  log?: NexusLog;
}

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (c) => ({
      mission: {
        id: c.req.header('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
    scopes: options.scopes,
    log: options.log,
  });

  return (
    new Hono()
      // Before the middleware, so it never has a scope handle.
      .get('/health', (c) => c.text('ok'))
      .use(di.middleware)
      .get(
        '/course/:to',
        di.inject(
          { charts: NAV_CHARTS, log: FLIGHT_LOG },
          async ({ charts, log }, c) => {
            if (c.req.header('x-mission-id') === 'missing-provider') {
              (await di.scope(c)).get(UNCHARTED);
            }
            const to = c.req.param('to') ?? '';
            log.record(`plotting ${to}`);
            return c.json({ course: charts.plot(to), entries: log.entries() });
          },
        ),
      )
      .get(
        '/mission',
        di.inject({}, async (_deps, c) => {
          await Promise.resolve(); // read across an await, as a service call would
          return c.json({
            id: options.scopes?.current?.()?.get(MISSION).id ?? null,
          });
        }),
      )
      .get(
        '/log/stream',
        di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
          streamSSE(c, async (stream) => {
            for (let tick = 1; tick <= 3; tick += 1) {
              await stream.sleep(50);
              log.record(`tick ${tick}`);
              await stream.writeSSE({ data: log.entries().at(-1) ?? '' });
            }
          }),
        ),
      )
      // The adapter's HTTPException keeps its 500 or 503 (spec 4.3); the
      // handler's own errors answer an empty 500.
      .onError((error, c) =>
        error instanceof HTTPException
          ? error.getResponse()
          : c.body(null, 500),
      )
  );
}
