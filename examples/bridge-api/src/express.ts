// Each framework entry exports createBridge under the same name, and a
// caller imports the one it serves (./hono, ./express, ./fastify).
// fallow-ignore-file duplicate-export

import { pipeline } from 'node:stream';

import { nexus, type ContainerSource } from '@nexusdi/express';
import {
  COMMAND_DESK,
  DECK_PLAN,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import express, { type ErrorRequestHandler, type Request } from 'express';

import { answerAtmosphere } from './bridge/atmosphere';
import { answerCommand } from './bridge/commands';
import { compartmentOf } from './bridge/compartment-of';
import { readJson } from './bridge/json-body';
import { parseTicks, SIM_BODY_LIMIT, TICKS_REFUSED } from './bridge/sim-ticks';
import { telemetryReadable } from './bridge/telemetry-readable';
import { SSE_HEADERS } from './bridge/telemetry-stream';
import { UNCHARTED } from './bridge/uncharted';
import type { BridgeOptions } from './hono';
import { FLIGHT_LOG, MISSION, NAV_CHARTS, SIM_DRIVER } from './ship/contracts';

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (req) => {
      const compartment = compartmentOf(req.path);
      return {
        mission: {
          id: req.get('x-mission-id') ?? 'survey-7',
          target: 'Kepler-442b',
        },
        ...(compartment === undefined ? {} : { compartment }),
      };
    },
    scopes: options.scopes,
    log: options.log,
  });

  // Reads any body as text, and readJson parses only application/json.
  const text = express.text({ type: () => true, limit: SIM_BODY_LIMIT });
  const body = (req: Request) =>
    readJson(req.get('content-type'), req.body as string | undefined);

  // Routes match in their own case and refuse a trailing slash, as Hono and
  // Fastify match them.
  const bridge = express();
  bridge.set('case sensitive routing', true);
  bridge.set('strict routing', true);
  bridge.get('/health', (_req, res) => {
    res.send('ok');
  });
  bridge.get('/graph', (_req, res, next) => {
    if (options.graph) res.json(options.graph());
    else next();
  });
  bridge.use(di.middleware);
  bridge.get(
    '/course/:to',
    di.inject(
      { charts: NAV_CHARTS, log: FLIGHT_LOG },
      async ({ charts, log }, req, res) => {
        if (req.get('x-mission-id') === 'missing-provider')
          (await di.scope(req)).get(UNCHARTED);
        const to = String(req.params.to);
        log.record(`plotting ${to}`);
        res.json({
          course: charts.plot(to),
          entries: log.entries(),
        });
      },
    ),
  );
  bridge.get(
    '/mission',
    di.inject({}, async (_deps, _req, res) => {
      await Promise.resolve();
      res.json({ id: options.scopes?.current?.()?.get(MISSION).id ?? null });
    }),
  );
  bridge.get(
    '/log/stream',
    di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, res) => {
      res.setHeader('content-type', 'text/event-stream');
      for (let tick = 1; tick <= 3; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        log.record(`tick ${tick}`);
        res.write(`data: ${log.entries().at(-1)}\n\n`);
      }
      res.end();
    }),
  );
  bridge.get(
    '/sim',
    di.inject(
      { state: SHIP_STATE, deck: DECK_PLAN },
      ({ state, deck }, _req, res) => {
        res.json(readShip(state.snapshot(), deck));
      },
    ),
  );
  bridge.get('/compartments/:id/atmosphere', async (req, res) => {
    const answer = answerAtmosphere(await di.scope(req));
    res.status(answer.status).json(answer.body);
  });
  bridge.get(
    '/telemetry',
    di.inject({ feed: TELEMETRY }, ({ feed }, _req, res) => {
      res.writeHead(200, SSE_HEADERS);
      // pipeline destroys the source when the client goes, which cancels the
      // stream and unsubscribes it from the feed.
      pipeline(telemetryReadable(feed, options.shutdown), res, () => {});
    }),
  );
  bridge.post(
    '/sim/advance',
    di.inject({ driver: SIM_DRIVER }, ({ driver }, _req, _res, next) => {
      // A live ship advances on its own timer, so the route exists only in
      // manual mode: next('route') skips the rest of this route, body
      // parsing included, and Express answers 404.
      next(driver.mode === 'live' ? 'route' : undefined);
    }),
    text,
    di.inject(
      { driver: SIM_DRIVER, deck: DECK_PLAN },
      ({ driver, deck }, req, res) => {
        const ticks = parseTicks(body(req));
        if (ticks === undefined) {
          res.status(400).json(TICKS_REFUSED);
          return;
        }
        res.json(readShip(driver.advance(ticks), deck));
      },
    ),
  );
  bridge.post(
    '/commands',
    text,
    di.inject({ desk: COMMAND_DESK }, ({ desk }, req, res) => {
      const answer = answerCommand(desk, body(req));
      res.status(answer.status).json(answer.body);
    }),
  );
  bridge.get(
    '/commands',
    di.inject({ state: SHIP_STATE }, ({ state }, _req, res) => {
      res.json(state.log());
    }),
  );
  // Every error ends with its status and an empty body, so Express's
  // development handler never sends a stack. NexusHttpError carries status,
  // so a 503 stays a 503.
  // Express knows an error handler by its four parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const empty: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status((error as { status?: number }).status ?? 500).end();
  };
  // A path no route matches answers an empty 404, so no answer repeats the
  // path, as Express's default page would.
  bridge.use((_req, res) => {
    res.status(404).end();
  });
  bridge.use(empty);
  return bridge;
}
