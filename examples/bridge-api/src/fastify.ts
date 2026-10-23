// Each framework entry exports createBridge under the same name, and a
// caller imports the one it serves (./hono, ./express, ./fastify).
// fallow-ignore-file duplicate-export

import { Readable } from 'node:stream';

import { nexus, type ContainerSource } from '@nexusdi/fastify';
import {
  COMMAND_DESK,
  DECK_PLAN,
  FTL_DRIVE,
  FtlDrive,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import Fastify, { type FastifyRequest } from 'fastify';

import { answerAtmosphere } from './bridge/atmosphere';
import { answerCommand } from './bridge/commands';
import { compartmentOf } from './bridge/compartment-of';
import { answerJump, answerSpool } from './bridge/ftl';
import { readJson } from './bridge/json-body';
import { parseTicks, SIM_BODY_LIMIT, TICKS_REFUSED } from './bridge/sim-ticks';
import { telemetryReadable } from './bridge/telemetry-readable';
import { SSE_HEADERS } from './bridge/telemetry-stream';
import { UNCHARTED } from './bridge/uncharted';
import type { BridgeOptions } from './hono';
import { FLIGHT_LOG, MISSION, NAV_CHARTS, SIM_DRIVER } from './ship/contracts';

export async function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (req) => {
      const compartment = compartmentOf(req.url);
      return {
        mission: {
          id: String(req.headers['x-mission-id'] ?? 'survey-7'),
          target: 'Kepler-442b',
        },
        ...(compartment === undefined ? {} : { compartment }),
      };
    },
    scopes: options.scopes,
    log: options.log,
  });
  // The drive loads on the first FTL request, and the section extends a
  // request scope that opened before the load.
  const ftl = di.load(FtlDrive);

  const bridge = Fastify();
  // A path no route matches answers an empty 404, so no answer repeats the
  // path, as Fastify's default body would.
  bridge.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send();
  });
  bridge.setErrorHandler((error, _req, reply) => {
    void reply
      .code((error as { statusCode?: number }).statusCode ?? 500)
      .send();
  });
  // Outside the encapsulated context that registers the adapter (spec 6.1),
  // so they get no scope handle.
  bridge.get('/health', async () => 'ok');
  bridge.get('/graph', async (_req, reply) =>
    options.graph ? options.graph() : reply.callNotFound(),
  );
  await bridge.register(async (scoped) => {
    await scoped.register(di.encapsulatedPlugin);
    // Reads any body as text, and readJson parses only application/json.
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser(
      '*',
      { parseAs: 'string' },
      (_req, text, done) => done(null, text),
    );
    const body = (req: FastifyRequest) =>
      readJson(req.headers['content-type'], req.body as string | undefined);
    scoped.get<{ Params: { to: string } }>(
      '/course/:to',
      di.inject(
        { charts: NAV_CHARTS, log: FLIGHT_LOG },
        async ({ charts, log }, req) => {
          if (req.headers['x-mission-id'] === 'missing-provider')
            (await di.scope(req)).get(UNCHARTED);
          log.record(`plotting ${req.params.to}`);
          return { course: charts.plot(req.params.to), entries: log.entries() };
        },
      ),
    );
    scoped.get(
      '/mission',
      di.inject({}, async () => {
        await Promise.resolve();
        return { id: options.scopes?.current?.()?.get(MISSION).id ?? null };
      }),
    );
    scoped.get(
      '/log/stream',
      di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, reply) => {
        async function* ticks() {
          for (let tick = 1; tick <= 3; tick += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            log.record(`tick ${tick}`);
            yield `data: ${log.entries().at(-1)}\n\n`;
          }
        }
        return reply.type('text/event-stream').send(Readable.from(ticks()));
      }),
    );
    scoped.get(
      '/sim',
      di.inject(
        { state: SHIP_STATE, deck: DECK_PLAN },
        async ({ state, deck }) => readShip(state.snapshot(), deck),
      ),
    );
    scoped.get('/compartments/:id/atmosphere', async (req, reply) => {
      const answer = answerAtmosphere(await di.scope(req));
      return reply.code(answer.status).send(answer.body);
    });
    scoped.get(
      '/telemetry',
      di.inject({ feed: TELEMETRY }, async ({ feed }, _req, reply) =>
        reply
          .headers(SSE_HEADERS)
          .send(telemetryReadable(feed, options.shutdown)),
      ),
    );
    scoped.post(
      '/sim/advance',
      {
        bodyLimit: SIM_BODY_LIMIT,
        // A live ship advances on its own timer, so the route exists only in
        // manual mode. The check runs in onRequest, before Fastify parses
        // the body, and callNotFound() answers as Fastify's 404 does.
        onRequest: async (req, reply) => {
          const driver = (await di.scope(req)).get(SIM_DRIVER);
          if (driver.mode === 'live') return reply.callNotFound();
        },
      },
      di.inject(
        { driver: SIM_DRIVER, deck: DECK_PLAN },
        async ({ driver, deck }, req, reply) => {
          const ticks = parseTicks(body(req));
          if (ticks === undefined) return reply.code(400).send(TICKS_REFUSED);
          return readShip(driver.advance(ticks), deck);
        },
      ),
    );
    scoped.post(
      '/commands',
      { bodyLimit: SIM_BODY_LIMIT },
      di.inject(
        { desk: COMMAND_DESK, log: FLIGHT_LOG },
        async ({ desk, log }, req, reply) => {
          const answer = answerCommand(desk, body(req), log);
          return reply.code(answer.status).send(answer.body);
        },
      ),
    );
    scoped.get(
      '/commands',
      di.inject({ state: SHIP_STATE }, async ({ state }) => state.log()),
    );
    scoped.post(
      '/ftl/spool',
      { onRequest: ftl },
      ftl.inject({ drive: FTL_DRIVE }, async ({ drive }, _req, reply) => {
        const answer = answerSpool(drive);
        return reply.code(answer.status).send(answer.body);
      }),
    );
    scoped.post(
      '/ftl/jump',
      { bodyLimit: SIM_BODY_LIMIT, onRequest: ftl },
      ftl.inject({ drive: FTL_DRIVE }, async ({ drive }, req, reply) => {
        const answer = answerJump(drive, body(req));
        return reply.code(answer.status).send(answer.body);
      }),
    );
  });
  return bridge;
}
