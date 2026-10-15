// Each framework entry exports createBridge under the same name, and a
// caller imports the one it serves (./hono, ./express, ./fastify).
// fallow-ignore-file duplicate-export

import { Readable } from 'node:stream';

import { nexus, type ContainerSource } from '@nexusdi/fastify';
import Fastify from 'fastify';

import { UNCHARTED } from './bridge/uncharted';
import type { BridgeOptions } from './hono';
import { FLIGHT_LOG, MISSION, NAV_CHARTS } from './ship/contracts';

export async function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (req) => ({
      mission: {
        id: String(req.headers['x-mission-id'] ?? 'survey-7'),
        target: 'Kepler-442b',
      },
    }),
    scopes: options.scopes,
    log: options.log,
  });

  const bridge = Fastify();
  bridge.setErrorHandler((error, _req, reply) => {
    void reply
      .code((error as { statusCode?: number }).statusCode ?? 500)
      .send();
  });
  // Outside the encapsulated context that registers the adapter (spec 6.1),
  // so it gets no scope handle.
  bridge.get('/health', async () => 'ok');
  await bridge.register(async (scoped) => {
    await scoped.register(di.encapsulatedPlugin);
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
  });
  return bridge;
}
