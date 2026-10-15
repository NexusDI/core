import { Nexus } from '@nexusdi/core';
import { env } from 'cloudflare:workers';

import { createBridge } from './hono';
import { meridian, OfflineMeridian } from './ship/meridian';
import { bridgePlugins } from './ship/plugins';

// NAV_CHARTS downloads over the relay, and Workers refuses I/O at module
// scope, so the relay graph uses the function form: one build per isolate,
// on the first request. The offline graph does no I/O and could build at
// module scope; Task 21's module-scope entry shows that form.
export default createBridge(() =>
  Nexus.create(env.RELAY_URL ? meridian(env.RELAY_URL) : OfflineMeridian, {
    plugins: bridgePlugins(),
  }),
);
