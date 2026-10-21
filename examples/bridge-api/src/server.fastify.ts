import type { AddressInfo } from 'node:net';

import { graph } from '@nexusdi/devtools';

import { createBridge } from './fastify';
import {
  isDev,
  listening,
  port,
  shipFromEnv,
  stopOnSigterm,
} from './ship-from-env';

const ship = await shipFromEnv();
const bridge = await createBridge(ship, {
  graph: isDev(process.env) ? () => graph(ship) : undefined,
});
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.listen({ port: port() });
listening((bridge.server.address() as AddressInfo).port);
stopOnSigterm(() => bridge.close(), ship);
