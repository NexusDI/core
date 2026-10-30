import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import * as devtools from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { introspect } from '../bridge/profile';
import { stopOnSigterm } from '../env/drain';
import { introspectionFromEnv, listening, port } from '../env/env';
import { shipLog } from '../env/log';
import { shipFromEnv } from '../env/ship';
import { createBridge } from './express';

// The bridge runs each request in its scope, and the flight recorder reads it.
const scopes = nodeScopes();
const introspection = introspectionFromEnv(process.env)
  ? introspect(devtools)
  : undefined;
await using ship = await shipFromEnv(
  scopes,
  process.env,
  introspection?.plugins,
);
const shutdown = new AbortController();
const bridge = createBridge(ship, {
  scopes,
  log: shipLog(),
  ...introspection?.options(ship),
  shutdown: shutdown.signal,
});
const server = bridge.listen(port(), () =>
  listening((server.address() as AddressInfo).port),
);
stopOnSigterm(server, shutdown);
await once(server, 'close');
// `await using` disposes the ship here, after the last response.
