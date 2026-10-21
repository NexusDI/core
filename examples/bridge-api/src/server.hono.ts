import { once } from 'node:events';

import { serve } from '@hono/node-server';

import { createBridge } from './hono';
import { listening, port, shipFromEnv } from './ship-from-env';

await using ship = await shipFromEnv();
const server = serve(
  { fetch: createBridge(ship).fetch, port: port() },
  (info) => listening(info.port),
);
process.once('SIGTERM', () => server.close());
await once(server, 'close');
