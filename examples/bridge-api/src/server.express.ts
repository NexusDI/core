import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { graph } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { createBridge } from './express';
import { stopOnSigterm } from './env/drain';
import { isDev, listening, port } from './env/env';
import { shipLog } from './env/log';
import { shipFromEnv } from './env/ship';

// The bridge runs each request in its scope, and the flight recorder reads it.
const scopes = nodeScopes();
await using ship = await shipFromEnv(scopes);
const shutdown = new AbortController();
const bridge = createBridge(ship, {
  scopes,
  log: shipLog(),
  graph: isDev(process.env) ? () => graph(ship) : undefined,
  shutdown: shutdown.signal,
});
const server = bridge.listen(port(), () =>
  listening((server.address() as AddressInfo).port),
);
stopOnSigterm(server, shutdown);
await once(server, 'close');
// `await using` disposes the ship here, after the last response.
