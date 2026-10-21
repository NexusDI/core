import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { createBridge } from './express';
import { listening, port, shipFromEnv } from './ship-from-env';

await using ship = await shipFromEnv();
const server = createBridge(ship).listen(port(), () =>
  listening((server.address() as AddressInfo).port),
);
process.once('SIGTERM', () => server.close());
await once(server, 'close');
