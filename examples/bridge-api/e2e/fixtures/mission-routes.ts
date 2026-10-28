import { Token } from '@nexusdi/core';
import { streamSSE } from 'hono/streaming';

import type { ExpressMount } from '../../src/express';
import type { FastifyMount } from '../../src/fastify';
import type { HonoMount } from '../../src/hono';
import type { BridgeOptions } from '../../src/bridge/options';
import { MISSION_HEADER } from '../../src/bridge/mission';
import { FLIGHT_LOG, MISSION } from '../../src/ship/contracts';

// Routes the e2e cases and the runtime legs need and the ship does not:
// the mission the request flies, a stream that keeps the request scope open
// while it writes, and a request whose handler resolves an unbound token.
// Each framework gets one mount function, which the bridge entry calls
// through its `mount` option.

/** The scope source the bridge runs requests in, as `BridgeOptions` names it. */
type Scopes = BridgeOptions['scopes'];

/** Bound nowhere: the request that names it answers 500. */
const UNCHARTED = new Token<{ plot(): void }>('Uncharted');

/** The mission header value that makes a course request resolve UNCHARTED. */
const MISSING_PROVIDER = 'missing-provider';

/** The ticks the stream writes, 50 ms apart. */
const TICKS = [1, 2, 3] as const;

const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * The mission of the request, read through the injected MISSION. With
 * `scopes`, the answer holds only when the ambient scope is the request's
 * scope. Without `scopes` there is no ambient scope to compare the injected
 * mission against, so the answer is null.
 */
const missionId = (
  scopes: Scopes,
  mission: { readonly id: string },
): string | null =>
  scopes?.current?.()?.get(MISSION) === mission ? mission.id : null;

export const honoMissionRoutes =
  (scopes?: Scopes): HonoMount =>
  (bridge, di) => {
    bridge.use('/course/*', async (c, next) => {
      if (c.req.header(MISSION_HEADER) === MISSING_PROVIDER)
        (await di.scope(c)).get(UNCHARTED);
      await next();
    });
    bridge.get(
      '/mission',
      di.inject({ mission: MISSION }, async ({ mission }, c) => {
        await Promise.resolve(); // read across an await, as a service call would
        return c.json({ id: missionId(scopes, mission) });
      }),
    );
    bridge.get(
      '/log/stream',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
        streamSSE(c, async (stream) => {
          for (const tick of TICKS) {
            await stream.sleep(50);
            log.record(`tick ${tick}`);
            await stream.writeSSE({ data: log.entries().at(-1) ?? '' });
          }
        }),
      ),
    );
  };

export const expressMissionRoutes =
  (scopes?: Scopes): ExpressMount =>
  (bridge, di) => {
    bridge.use('/course', async (req, _res, next) => {
      if (req.get(MISSION_HEADER) === MISSING_PROVIDER)
        (await di.scope(req)).get(UNCHARTED);
      next();
    });
    bridge.get(
      '/mission',
      di.inject({ mission: MISSION }, async ({ mission }, _req, res) => {
        await Promise.resolve();
        res.json({ id: missionId(scopes, mission) });
      }),
    );
    bridge.get(
      '/log/stream',
      di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, res) => {
        res.setHeader('content-type', 'text/event-stream');
        for (const tick of TICKS) {
          await pause();
          log.record(`tick ${tick}`);
          res.write(`data: ${log.entries().at(-1)}\n\n`);
        }
        res.end();
      }),
    );
  };

export const fastifyMissionRoutes =
  (scopes?: Scopes): FastifyMount =>
  (scoped, di) => {
    scoped.addHook('onRequest', async (req) => {
      if (req.headers[MISSION_HEADER] === MISSING_PROVIDER)
        (await di.scope(req)).get(UNCHARTED);
    });
    scoped.get(
      '/mission',
      di.inject({ mission: MISSION }, async ({ mission }) => {
        await Promise.resolve();
        return { id: missionId(scopes, mission) };
      }),
    );
    scoped.get(
      '/log/stream',
      di.inject({ log: FLIGHT_LOG }, ({ log }, _req, reply) => {
        // A web stream, so this file bundles for runtimes without node:stream.
        // Each pull writes one tick, and a cancel from an aborted client
        // stops the ticks.
        const encoder = new TextEncoder();
        const ticks = TICKS[Symbol.iterator]();
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const next = ticks.next();
            if (next.done) {
              controller.close();
              return;
            }
            await pause();
            log.record(`tick ${next.value}`);
            controller.enqueue(
              encoder.encode(`data: ${log.entries().at(-1)}\n\n`),
            );
          },
          cancel() {
            ticks.return?.();
          },
        });
        return reply.type('text/event-stream').send(stream);
      }),
    );
  };
