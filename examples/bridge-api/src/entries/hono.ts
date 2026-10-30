import {
  nexus,
  type ContainerSource,
  type NexusEnv,
  type NexusHono,
} from '@nexusdi/hono';
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

import { answerAtmosphere } from '../bridge/atmosphere';
import { answerCommand } from '../bridge/commands';
import { compartmentOf } from '../bridge/compartment-of';
import { answerFtlSection, ftlRating } from '../bridge/ftl';
import { readJson } from '../bridge/json-body';
import { MISSION_HEADER, requestOf } from '../bridge/mission';
import type { BridgeOptions } from '../bridge/options';
import { parseTicks, SIM_BODY_LIMIT, TICKS_REFUSED } from '../bridge/sim-ticks';
import { SSE_HEADERS, telemetryStream } from '../bridge/telemetry-stream';
import { FLIGHT_LOG, NAV_CHARTS, SIM_DRIVER } from '../ship/contracts';

/**
 * A hook for the e2e and runtime-test routes: it adds routes right after the
 * adapter middleware, so they run in a request scope. Ship routes belong in
 * this entry.
 */
export type HonoMount = (bridge: Hono<NexusEnv>, di: NexusHono) => void;

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions & { mount?: HonoMount } = {},
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
  // POST /sections/ftl loads the drive, and the section extends a request
  // scope that opened before the load.
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
  bridge.get('/graph', async (c) => {
    const drawn = await options.graph?.();
    return drawn ? c.json(drawn) : c.notFound();
  });
  bridge.get('/profile', async (c) => {
    const answer = await options.profile?.();
    return answer ? c.json(answer) : c.notFound();
  });
  bridge.use(di.middleware);
  options.mount?.(bridge, di);

  bridge.get(
    '/course/:to',
    di.inject({ charts: NAV_CHARTS, log: FLIGHT_LOG }, ({ charts, log }, c) => {
      const to = c.req.param('to') ?? '';
      log.record(`plotting ${to}`);
      return c.json({ course: charts.plot(to), entries: log.entries() });
    }),
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
    // manual mode. The check runs before bodyLimit reads the body.
    di.injectMiddleware({ driver: SIM_DRIVER }, async ({ driver }, c, next) => {
      if (driver.mode === 'live') return c.notFound();
      await next();
      return undefined;
    }),
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
    '/sections/ftl',
    ftl,
    ftl.inject({ drive: FTL_DRIVE }, ({ drive }, c) =>
      c.json(answerFtlSection(drive)),
    ),
  );
  return bridge;
}
