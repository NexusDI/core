import { Nexus } from '@nexusdi/core';
import { env } from 'cloudflare:workers';

import { meridian, OfflineMeridian } from '../ship/meridian.module';
import { bridgePlugins } from '../ship/plugins';
import { createBridge } from './hono';

// NAV_CHARTS downloads over the relay, and Workers refuses I/O at module
// scope, so the relay graph uses the function form: one build per isolate,
// on the first request. The offline graph does no I/O and could build at
// module scope, as src/entries/worker.offline.ts does.
export default createBridge(() =>
  Nexus.create(env.RELAY_URL ? meridian(env.RELAY_URL) : OfflineMeridian, {
    plugins: bridgePlugins(),
  }),
);
