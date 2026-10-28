import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { serve } from '@hono/node-server';
import type { ContainerSource } from '@nexusdi/hono';
import type { NodeScopes } from '@nexusdi/node';

import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
import { createBridge as honoBridge } from '../src/hono';
import {
  expressMissionRoutes,
  fastifyMissionRoutes,
  honoMissionRoutes,
} from './fixtures/mission-routes';

export interface RunningBridge {
  readonly url: string;
  close(): Promise<void>;
}
export type StartBridge = (
  ship: ContainerSource,
  scopes?: NodeScopes,
) => Promise<RunningBridge>;

function urlOf(address: AddressInfo | string | null): string {
  if (address === null || typeof address === 'string')
    throw new Error('no TCP address');
  return `http://127.0.0.1:${address.port}`;
}

/** Waits for `server` to listen, then answers its URL and its close step. */
async function listening(server: Server) {
  await once(server, 'listening');
  return { url: urlOf(server.address()), close: () => shut(server) };
}

/**
 * Closes `server` once every test request has finished. On Node 22.x,
 * server.close() does not close a connection that has never sent a request
 * (nodejs/node#63452), and undici 6 opens one after a client aborts a
 * stream, so the open connections are closed first.
 */
async function shut(server: Server): Promise<void> {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
}

export const servers: Readonly<
  Record<'hono' | 'express' | 'fastify', StartBridge>
> = {
  async hono(ship, scopes) {
    const server = serve({
      fetch: honoBridge(ship, { scopes, mount: honoMissionRoutes(scopes) })
        .fetch,
      port: 0,
      hostname: '127.0.0.1',
    }) as Server;
    return listening(server);
  },
  async express(ship, scopes) {
    const bridge = expressBridge(ship, {
      scopes,
      mount: expressMissionRoutes(scopes),
    });
    return listening(bridge.listen(0, '127.0.0.1'));
  },
  async fastify(ship, scopes) {
    const bridge = await fastifyBridge(ship, {
      scopes,
      mount: fastifyMissionRoutes(scopes),
    });
    await bridge.listen({ port: 0, host: '127.0.0.1' });
    return {
      url: urlOf(bridge.server.address()),
      close: async () => {
        bridge.server.closeAllConnections();
        await bridge.close();
      },
    };
  },
};
