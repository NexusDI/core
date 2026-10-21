import { once } from 'node:events';

import { serve } from '@hono/node-server';

import { createBridge } from './hono';
import { listening, port, shipFromEnv, stopOnSigterm } from './ship-from-env';

await using ship = await shipFromEnv();
const bridge = createBridge(ship);
const server = serve({ fetch: bridge.fetch, port: port() }, (info) =>
  listening(info.port),
);
stopOnSigterm(() => server.close(), ship);
await once(server, 'close');
