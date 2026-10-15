import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

import { createBridge } from './hono';
import { OfflineMeridian } from './ship/meridian';

// Built at module scope: OfflineMeridian does no I/O while it is built, which
// Workers allows in the global scope (spec 9.2). src/worker.ts builds on the
// first request, for a graph whose factories fetch.
const ship = await Nexus.create(OfflineMeridian);
export default createBridge(ship, { scopes: nodeScopes() });
