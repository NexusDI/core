import { once } from 'node:events';
import type { Server } from 'node:http';

import { serve } from '@hono/node-server';
import { graph } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { shellOrigins } from '../env/cors';
import { stopOnSigterm } from '../env/drain';
import { isDev, listening, port } from '../env/env';
import { shipLog } from '../env/log';
import { shipFromEnv } from '../env/ship';
import { createBridge, type HonoMount } from './hono';

/**
 * Runs the ship behind Hono on the port from the environment until SIGTERM.
 * `mount` is a hook for the routes that e2e and runtime tests need and the
 * ship does not (see `HonoMount`). It receives the scopes the bridge runs
 * requests in. Ship routes belong in the entry, so the demo passes none.
 */
export async function startHono(
  mount?: (scopes: ReturnType<typeof nodeScopes>) => HonoMount,
): Promise<void> {
  // The bridge runs each request in its scope, and the flight recorder reads it.
  const scopes = nodeScopes();
  await using ship = await shipFromEnv(scopes);
  const shutdown = new AbortController();
  const bridge = createBridge(ship, {
    scopes,
    log: shipLog(),
    graph: isDev(process.env) ? () => graph(ship) : undefined,
    shutdown: shutdown.signal,
    origins: shellOrigins(),
    mount: mount?.(scopes),
  });
  const server = serve({ fetch: bridge.fetch, port: port() }, (info) =>
    listening(info.port),
  );
  // serve() returns an http.Server unless its options name another server.
  stopOnSigterm(server as Server, shutdown);
  await once(server, 'close');
  // `await using` disposes the ship here, after the last response.
}
