import { once } from 'node:events';
import type { Server } from 'node:http';

import { serve } from '@hono/node-server';
import { graph } from '@nexusdi/devtools';

import { createBridge } from './hono';
import {
  isDev,
  listening,
  port,
  shipFromEnv,
  stopOnSigterm,
} from './ship-from-env';

await using ship = await shipFromEnv();
const bridge = createBridge(ship, {
  graph: isDev(process.env) ? () => graph(ship) : undefined,
});
const server = serve({ fetch: bridge.fetch, port: port() }, (info) =>
  listening(info.port),
);
// serve() answers an http.Server unless its options name another server.
stopOnSigterm(server as Server, ship);
await once(server, 'close');
