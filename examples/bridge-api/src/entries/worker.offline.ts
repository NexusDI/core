import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { env } from 'cloudflare:workers';

import { introspect } from '../bridge/profile';
import { introspectionFromEnv } from '../env/env';
import { shipLog } from '../env/log';
import { OfflineMeridian } from '../ship/meridian.module';
import { bridgePlugins } from '../ship/plugins';
import { createBridge } from './hono';

// Built at module scope: OfflineMeridian does no I/O while it is built, which
// Workers allows in the global scope. src/entries/worker.ts builds on the
// first request, for a graph whose factories fetch.
// The bridge runs each request in its scope, and the flight recorder reads it.
// SHIP_INTROSPECTION is unset on a Worker unless the environment sets it. A
// bad value throws at module scope, so the Worker does not start. Devtools
// loads only when the flag is on.
const introspection = introspectionFromEnv(
  { SHIP_INTROSPECTION: Reflect.get(env, 'SHIP_INTROSPECTION') },
  { worker: true },
)
  ? introspect(await import('@nexusdi/devtools'))
  : undefined;
const scopes = nodeScopes();
const ship = await Nexus.create(OfflineMeridian, {
  plugins: [...bridgePlugins({ scopes }), ...(introspection?.plugins ?? [])],
});
export default createBridge(ship, {
  scopes,
  log: shipLog(),
  ...introspection?.options(ship),
});
