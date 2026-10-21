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
const shutdown = new AbortController();
const bridge = createBridge(ship, {
  graph: isDev(process.env) ? () => graph(ship) : undefined,
  shutdown: shutdown.signal,
});
const server = bridge.listen(port(), () =>
  listening((server.address() as AddressInfo).port),
);
stopOnSigterm(server, shutdown);
await once(server, 'close');
// `await using` disposes the ship here, after the last response.
