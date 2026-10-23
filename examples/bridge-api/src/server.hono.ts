import { once } from 'node:events';
import type { Server } from 'node:http';

import { serve } from '@hono/node-server';
import { graph } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { createBridge } from './hono';
import {
  isDev,
  listening,
  port,
  shellOrigins,
  shipFromEnv,
  stopOnSigterm,
} from './ship-from-env';

// The bridge runs each request in its scope, and the flight recorder reads it.
const scopes = nodeScopes();
await using ship = await shipFromEnv(scopes);
const shutdown = new AbortController();
const bridge = createBridge(ship, {
  scopes,
  graph: isDev(process.env) ? () => graph(ship) : undefined,
  shutdown: shutdown.signal,
  origins: shellOrigins(),
});
const server = serve({ fetch: bridge.fetch, port: port() }, (info) =>
  listening(info.port),
);
// serve() returns an http.Server unless its options name another server.
stopOnSigterm(server as Server, shutdown);
await once(server, 'close');
// `await using` disposes the ship here, after the last response.
