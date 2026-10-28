import type { AddressInfo } from 'node:net';

import { graph } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { stopOnSigterm } from '../env/drain';
import { isDev, listening, port } from '../env/env';
import { shipLog } from '../env/log';
import { shipFromEnv } from '../env/ship';
import { createBridge } from './fastify';

// The bridge runs each request in its scope, and the flight recorder reads it.
const scopes = nodeScopes();
const ship = await shipFromEnv(scopes);
const shutdown = new AbortController();
const bridge = await createBridge(ship, {
  scopes,
  log: shipLog(),
  graph: isDev(process.env) ? () => graph(ship) : undefined,
  shutdown: shutdown.signal,
});
// close() runs preClose before the requests in flight drain, and onClose
// after them. The streams end first, so the drain can finish, and the ship
// disposes last.
bridge.addHook('preClose', async () => shutdown.abort());
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
// One host gives one server. On `localhost`, Fastify listens on 127.0.0.1
// and ::1 with two servers, and `bridge.server` is only one of them.
await bridge.listen({ port: port(), host: process.env.HOST || '::' });
listening((bridge.server.address() as AddressInfo).port);
stopOnSigterm(bridge.server, shutdown, { close: () => bridge.close() });
