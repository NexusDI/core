import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

import { OfflineMeridian } from '../ship/meridian.module';
import { bridgePlugins } from '../ship/plugins';
import { createBridge } from './hono';

// Built at module scope: OfflineMeridian does no I/O while it is built, which
// Workers allows in the global scope. src/entries/worker.ts builds on the
// first request, for a graph whose factories fetch.
// The bridge runs each request in its scope, and the flight recorder reads it.
const scopes = nodeScopes();
const ship = await Nexus.create(OfflineMeridian, {
  plugins: bridgePlugins({ scopes }),
});
export default createBridge(ship, { scopes });
