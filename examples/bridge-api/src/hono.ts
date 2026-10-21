import type { Scope } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import { nexus, type ContainerSource, type NexusLog } from '@nexusdi/hono';
import {
  DECK_PLAN,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';

import { parseTicks, SIM_BODY_LIMIT, TICKS_REFUSED } from './bridge/sim-ticks';
import { SSE_HEADERS, telemetryStream } from './bridge/telemetry-stream';
import { UNCHARTED } from './bridge/uncharted';
import { FLIGHT_LOG, MISSION, NAV_CHARTS, SIM_DRIVER } from './ship/contracts';

export interface BridgeOptions {
  scopes?: {
    run<R>(scope: Scope, fn: () => R): R;
    current?(): Scope | undefined;
  };
  log?: NexusLog;
  /** Draws the graph `GET /graph` answers. Without it, the route answers 404. */
  graph?: () => NexusGraph;
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
      // Before the middleware, so they never have a scope handle.
      .get('/health', (c) => c.text('ok'))
      .get('/graph', (c) =>
        options.graph ? c.json(options.graph()) : c.notFound(),
      )
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
      .get(
        '/sim',
        di.inject(
          { state: SHIP_STATE, deck: DECK_PLAN },
          ({ state, deck }, c) => c.json(readShip(state.snapshot(), deck)),
        ),
      )
      .get(
        '/telemetry',
        di.inject({ feed: TELEMETRY }, ({ feed }, c) =>
          c.body(telemetryStream(feed), 200, SSE_HEADERS),
        ),
      )
      .post(
        '/sim/advance',
        // A live ship advances on its own timer, so the route exists only in
        // manual mode. The check runs before bodyLimit reads the body, and
        // notFound() answers as Hono's 404 does.
        async (c, next) => {
          const driver = (await di.scope(c)).get(SIM_DRIVER);
          if (driver.mode === 'live') return c.notFound();
          await next();
          return undefined;
        },
        bodyLimit({ maxSize: SIM_BODY_LIMIT }),
        di.inject(
          { driver: SIM_DRIVER, deck: DECK_PLAN },
          async ({ driver, deck }, c) => {
            // c.req.json() parses any body, and the Express and Fastify routes
            // parse only one sent as application/json.
            const json = c.req
              .header('content-type')
              ?.startsWith('application/json');
            const body = json
              ? await c.req.json().catch(() => undefined)
              : undefined;
            const ticks = parseTicks(body);
            if (ticks === undefined) return c.json(TICKS_REFUSED, 400);
            return c.json(readShip(driver.advance(ticks), deck));
          },
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
