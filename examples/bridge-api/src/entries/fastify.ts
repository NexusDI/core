// Each framework entry exports createBridge under the same name, and a
// caller imports the one it serves (./hono, ./express, ./fastify).
// fallow-ignore-file duplicate-export

import {
  nexus,
  type ContainerSource,
  type NexusFastify,
} from '@nexusdi/fastify';
import {
  ALARM_BOARD,
  COMMAND_DESK,
  DECK_PLAN,
  FTL_DRIVE,
  FtlDrive,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { answerAlarms } from '../bridge/alarms';
import { answerAudit } from '../bridge/audit';
import { answerAtmosphere } from '../bridge/atmosphere';
import { answerCommand } from '../bridge/commands';
import { answerCourse } from '../bridge/course';
import { compartmentOf } from '../bridge/compartment-of';
import { answerFtlSection, ftlRating } from '../bridge/ftl';
import { readJson } from '../bridge/json-body';
import { MISSION_HEADER, requestOf } from '../bridge/mission';
import type { BridgeOptions } from '../bridge/options';
import { parseTicks, SIM_BODY_LIMIT, TICKS_REFUSED } from '../bridge/sim-ticks';
import { telemetryReadable } from '../bridge/telemetry-readable';
import { SSE_HEADERS } from '../bridge/telemetry-stream';
import {
  AUDIT_LOG,
  COMMS_LOG,
  FLIGHT_LOG,
  NAV_CHARTS,
  SIM_DRIVER,
} from '../ship/contracts';

/**
 * A hook for the e2e and runtime-test routes: it adds routes to the
 * encapsulated context right after the adapter plugin, so they run in a
 * request scope. Ship routes belong in this entry.
 */
export type FastifyMount = (scoped: FastifyInstance, di: NexusFastify) => void;

export async function createBridge(
  ship: ContainerSource,
  options: BridgeOptions & { mount?: FastifyMount } = {},
) {
  const di = nexus(ship, {
    request: (req) =>
      requestOf(req.headers[MISSION_HEADER], compartmentOf(req.url)),
    scopes: options.scopes,
    log: options.log,
  });
  // POST /sections/ftl loads the drive, and the section extends a request
  // scope that opened before the load.
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
  // Outside the encapsulated context that registers the adapter,
  // so they get no scope handle.
  bridge.get('/health', async () => 'ok');
  bridge.get(
    '/graph',
    async (_req, reply) => (await options.graph?.()) ?? reply.callNotFound(),
  );
  bridge.get(
    '/profile',
    async (_req, reply) => (await options.profile?.()) ?? reply.callNotFound(),
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
    options.mount?.(scoped, di);
    scoped.get<{ Params: { to: string } }>(
      '/course/:to',
      di.inject(
        { charts: NAV_CHARTS, log: FLIGHT_LOG },
        async ({ charts, log }, req, reply) => {
          const answer = answerCourse(charts, log, req.params.to);
          return reply.code(answer.status).send(answer.body);
        },
      ),
    );
    scoped.get(
      '/sim',
      di.inject(
        { state: SHIP_STATE, deck: DECK_PLAN },
        async ({ state, deck }) => readShip(state.snapshot(), deck),
      ),
    );
    scoped.get(
      '/alarms',
      di.inject({ board: ALARM_BOARD }, async ({ board }) =>
        answerAlarms(board),
      ),
    );
    scoped.get(
      '/audit',
      di.inject(
        { audit: AUDIT_LOG, comms: COMMS_LOG },
        async ({ audit, comms }) => answerAudit(audit, comms),
      ),
    );
    scoped.get('/compartments/:id/atmosphere', async (req, reply) => {
      const answer = answerAtmosphere(await di.scope(req));
      return reply.code(answer.status).send(answer.body);
    });
    scoped.get(
      '/telemetry',
      di.inject({ feed: TELEMETRY }, async ({ feed }, req, reply) =>
        reply
          .headers(SSE_HEADERS)
          .send(
            telemetryReadable(
              feed,
              options.shutdown,
              ftlRating(await di.scope(req)),
            ),
          ),
      ),
    );
    scoped.post(
      '/sim/advance',
      {
        bodyLimit: SIM_BODY_LIMIT,
        // A live ship advances on its own timer, so the route exists only in
        // manual mode. The check runs in onRequest, before Fastify parses
        // the body, and callNotFound() answers as Fastify's 404 does.
        onRequest: di.injectHook(
          { driver: SIM_DRIVER },
          async ({ driver }, _req, reply) => {
            if (driver.mode === 'live') return reply.callNotFound();
          },
        ),
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
    scoped.get(
      '/commands',
      di.inject({ state: SHIP_STATE }, async ({ state }) => state.log()),
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
    scoped.post(
      '/sections/ftl',
      { onRequest: ftl },
      ftl.inject({ drive: FTL_DRIVE }, async ({ drive }, _req, reply) =>
        reply.send(answerFtlSection(drive)),
      ),
    );
  });
  return bridge;
}
