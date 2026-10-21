import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { graph } from '@nexusdi/devtools';

import { createBridge } from './express';
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
const server = bridge.listen(port(), () =>
  listening((server.address() as AddressInfo).port),
);
stopOnSigterm(() => server.close(), ship);
await once(server, 'close');
