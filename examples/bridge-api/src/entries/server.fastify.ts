import type { AddressInfo } from 'node:net';

import { stopOnSigterm } from '../env/drain';
import { nodeBridgeParts } from '../env/bridge-parts';
import { listening, port } from '../env/env';
import { createBridge } from './fastify';

const { ship, shutdown, options } = await nodeBridgeParts();
const bridge = await createBridge(ship, options);
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
