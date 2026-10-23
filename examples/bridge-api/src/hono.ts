import type { Scope } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import { nexus, type ContainerSource, type NexusLog } from '@nexusdi/hono';
import {
  COMMAND_DESK,
  DECK_PLAN,
  FTL_DRIVE,
  FtlDrive,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';

import { answerAtmosphere } from './bridge/atmosphere';
import { answerCommand } from './bridge/commands';
import { compartmentOf } from './bridge/compartment-of';
import { answerJump, answerSpool, ftlRating } from './bridge/ftl';
import { readJson } from './bridge/json-body';
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
  /** Ends every open `GET /telemetry` stream with `ship offline` when it aborts. */
  shutdown?: AbortSignal;
}

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (c) => {
      // c.req.path decodes percent escapes, and Express and Fastify read the
      // path as sent, so Hono reads the raw pathname from the URL.
      const compartment = compartmentOf(new URL(c.req.url).pathname);
      return {
        mission: {
          id: c.req.header('x-mission-id') ?? 'survey-7',
          target: 'Kepler-442b',
        },
        ...(compartment === undefined ? {} : { compartment }),
      };
    },
    scopes: options.scopes,
    log: options.log,
  });
  // An empty 413, as Express and Fastify answer it.
  const limit = bodyLimit({
    maxSize: SIM_BODY_LIMIT,
    onError: (c) => c.body(null, 413),
  });
  // The drive loads on the first FTL request, and the section extends a
  // request scope that opened before the load.
  const ftl = di.load(FtlDrive);

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
      .get('/compartments/:id/atmosphere', async (c) => {
        const { status, body } = answerAtmosphere(await di.scope(c));
        return c.json(body, status);
      })
      .get(
        '/telemetry',
        di.inject({ feed: TELEMETRY }, async ({ feed }, c) =>
          c.body(
            telemetryStream(
              feed,
              options.shutdown,
              ftlRating(await di.scope(c)),
            ),
            200,
            SSE_HEADERS,
          ),
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
        limit,
        di.inject(
          { driver: SIM_DRIVER, deck: DECK_PLAN },
          async ({ driver, deck }, c) => {
            const ticks = parseTicks(
              readJson(c.req.header('content-type'), await c.req.text()),
            );
            if (ticks === undefined) return c.json(TICKS_REFUSED, 400);
            return c.json(readShip(driver.advance(ticks), deck));
          },
        ),
      )
      .post(
        '/commands',
        limit,
        di.inject(
          { desk: COMMAND_DESK, log: FLIGHT_LOG },
          async ({ desk, log }, c) => {
            const { status, body } = answerCommand(
              desk,
              readJson(c.req.header('content-type'), await c.req.text()),
              log,
            );
            return c.json(body, status);
          },
        ),
      )
      .get(
        '/commands',
        di.inject({ state: SHIP_STATE }, ({ state }, c) => c.json(state.log())),
      )
      .post(
        '/ftl/spool',
        ftl,
        ftl.inject({ drive: FTL_DRIVE }, ({ drive }, c) => {
          const { status, body } = answerSpool(drive);
          return c.json(body, status);
        }),
      )
      .post(
        '/ftl/jump',
        limit,
        ftl,
        ftl.inject({ drive: FTL_DRIVE }, async ({ drive }, c) => {
          const { status, body } = answerJump(
            drive,
            readJson(c.req.header('content-type'), await c.req.text()),
          );
          return c.json(body, status);
        }),
      )
      // A path no route matches answers an empty 404, as Express and
      // Fastify answer it, so no answer repeats the path.
      .notFound((c) => c.body(null, 404))
      // The adapter's HTTPException keeps its 500 or 503 (spec 4.3); the
      // handler's own errors answer an empty 500.
      .onError((error, c) =>
        error instanceof HTTPException
          ? error.getResponse()
          : c.body(null, 500),
      )
  );
}
