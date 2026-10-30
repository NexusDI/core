import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { stopOnSigterm } from '../env/drain';
import { nodeBridgeParts } from '../env/bridge-parts';
import { listening, port } from '../env/env';
import { createBridge } from './express';

const { ship: built, shutdown, options } = await nodeBridgeParts();
await using ship = built;
const bridge = createBridge(ship, options);
const server = bridge.listen(port(), () =>
  listening((server.address() as AddressInfo).port),
);
stopOnSigterm(server, shutdown);
await once(server, 'close');
// `await using` disposes the ship here, after the last response.
