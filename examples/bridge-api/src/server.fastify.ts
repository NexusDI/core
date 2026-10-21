import type { AddressInfo } from 'node:net';

import { createBridge } from './fastify';
import { listening, port, shipFromEnv, stopOnSigterm } from './ship-from-env';

const ship = await shipFromEnv();
const bridge = await createBridge(ship);
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.listen({ port: port() });
listening((bridge.server.address() as AddressInfo).port);
stopOnSigterm(() => bridge.close(), ship);
