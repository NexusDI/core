import { nexus, type ContainerSource, type NexusEnv } from '@nexusdi/hono';
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
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';

import { answerAtmosphere } from './bridge/atmosphere';
import { answerCommand } from './bridge/commands';
import { compartmentOf } from './bridge/compartment-of';
import { answerJump, answerSpool, ftlRating } from './bridge/ftl';
import { readJson } from './bridge/json-body';
import { MISSION_HEADER, requestOf } from './bridge/mission';
import type { BridgeOptions } from './bridge/options';
import { parseTicks, SIM_BODY_LIMIT, TICKS_REFUSED } from './bridge/sim-ticks';
import { SSE_HEADERS, telemetryStream } from './bridge/telemetry-stream';
import { UNCHARTED } from './bridge/uncharted';
import { FLIGHT_LOG, MISSION, NAV_CHARTS, SIM_DRIVER } from './ship/contracts';

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    // c.req.path decodes percent escapes, and Express and Fastify read the
    // path as sent, so Hono reads the raw pathname from the URL.
    request: (c) =>
      requestOf(
        c.req.header(MISSION_HEADER),
        compartmentOf(new URL(c.req.url).pathname),
      ),
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
  const bridge = new Hono<NexusEnv>();

  // First, so a preflight answers before any route and every answer carries
  // the headers. The shell sends only content-type.
  if (options.origins?.length) {
    bridge.use(
      cors({
        origin: [...options.origins],
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['content-type'],
      }),
    );
  }
  // An empty 404 for a path no route matches, as Express and Fastify answer
  // it, so no answer repeats the path.
  bridge.notFound((c) => c.body(null, 404));
  // The adapter's HTTPException keeps its 500 or 503, and the handler's own
  // errors answer 500. Both bodies are empty, as on Express and Fastify.
  bridge.onError((error, c) =>
    c.body(null, error instanceof HTTPException ? error.status : 500),
  );

  // Before the middleware, so they never have a scope handle.
  bridge.get('/health', (c) => c.text('ok'));
  bridge.get('/graph', (c) =>
    options.graph ? c.json(options.graph()) : c.notFound(),
  );
  bridge.use(di.middleware);

  bridge.get(
    '/course/:to',
    di.inject(
      { charts: NAV_CHARTS, log: FLIGHT_LOG },
      async ({ charts, log }, c) => {
        if (c.req.header(MISSION_HEADER) === 'missing-provider') {
          (await di.scope(c)).get(UNCHARTED);
        }
        const to = c.req.param('to') ?? '';
        log.record(`plotting ${to}`);
        return c.json({ course: charts.plot(to), entries: log.entries() });
      },
    ),
  );
  bridge.get(
    '/mission',
    di.inject({}, async (_deps, c) => {
      await Promise.resolve(); // read across an await, as a service call would
      return c.json({
        id: options.scopes?.current?.()?.get(MISSION).id ?? null,
      });
    }),
  );
  bridge.get(
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
  );
  bridge.get(
    '/sim',
    di.inject({ state: SHIP_STATE, deck: DECK_PLAN }, ({ state, deck }, c) =>
      c.json(readShip(state.snapshot(), deck)),
    ),
  );
  bridge.get('/compartments/:id/atmosphere', async (c) => {
    const answer = answerAtmosphere(await di.scope(c));
    return c.json(answer.body, answer.status);
  });
  bridge.get(
    '/telemetry',
    di.inject({ feed: TELEMETRY }, async ({ feed }, c) =>
      c.body(
        telemetryStream(feed, options.shutdown, ftlRating(await di.scope(c))),
        200,
        SSE_HEADERS,
      ),
    ),
  );
  bridge.post(
    '/sim/advance',
    // A live ship advances on its own timer, so the route exists only in
    // manual mode. The check runs before bodyLimit reads the body. A handler
    // made by di.inject cannot pass the request on, so this middleware reads
    // the scope itself.
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
  );
  bridge.get(
    '/commands',
    di.inject({ state: SHIP_STATE }, ({ state }, c) => c.json(state.log())),
  );
  bridge.post(
    '/commands',
    limit,
    di.inject(
      { desk: COMMAND_DESK, log: FLIGHT_LOG },
      async ({ desk, log }, c) => {
        const answer = answerCommand(
          desk,
          readJson(c.req.header('content-type'), await c.req.text()),
          log,
        );
        return c.json(answer.body, answer.status);
      },
    ),
  );
  bridge.post(
    '/ftl/spool',
    ftl,
    ftl.inject({ drive: FTL_DRIVE }, ({ drive }, c) => {
      const answer = answerSpool(drive);
      return c.json(answer.body, answer.status);
    }),
  );
  bridge.post(
    '/ftl/jump',
    limit,
    ftl,
    ftl.inject({ drive: FTL_DRIVE }, async ({ drive }, c) => {
      const answer = answerJump(
        drive,
        readJson(c.req.header('content-type'), await c.req.text()),
      );
      return c.json(answer.body, answer.status);
    }),
  );
  return bridge;
}
