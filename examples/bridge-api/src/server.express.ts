import { once } from 'node:events';

import { createBridge } from './express';
import { port, shipFromEnv } from './ship-from-env';

await using ship = await shipFromEnv();
const server = createBridge(ship).listen(port());
process.once('SIGTERM', () => server.close());
await once(server, 'close');
