import { Nexus } from '@nexusdi/core';
import { env } from 'cloudflare:workers';

import { introspect, type Introspection } from '../bridge/profile';
import { introspectionFromEnv } from '../env/env';
import { shipLog } from '../env/log';
import { meridian, OfflineMeridian } from '../ship/meridian.module';
import { bridgePlugins } from '../ship/plugins';
import { createBridge } from './hono';

interface Built {
  readonly ship: Nexus;
  readonly introspection: Introspection | undefined;
}

/**
 * One build per isolate, on the first request: NAV_CHARTS downloads over the
 * relay, and Workers refuses I/O at module scope, so the relay graph uses the
 * function form. The offline graph does no I/O and could build at module
 * scope, as src/entries/worker.offline.ts does. SHIP_INTROSPECTION is unset
 * on a Worker unless the environment sets it, and a bad value throws here, so
 * every request answers 500. Devtools loads only when the flag is on.
 */
async function build(): Promise<Built> {
  const on = introspectionFromEnv(
    { SHIP_INTROSPECTION: Reflect.get(env, 'SHIP_INTROSPECTION') },
    { worker: true },
  );
  const introspection = on
    ? introspect(await import('@nexusdi/devtools'))
    : undefined;
  const ship = await Nexus.create(
    env.RELAY_URL ? meridian(env.RELAY_URL) : OfflineMeridian,
    { plugins: [...bridgePlugins(), ...(introspection?.plugins ?? [])] },
  );
  return { ship, introspection };
}

const log = shipLog();

// A failed build is not kept, so the next request builds again. The first
// request to see the failure logs it, since /graph and /profile answer 500
// without going through the adapter's log.
let building: Promise<Built> | undefined;
const built = (): Promise<Built> =>
  (building ??= build().catch((error: unknown) => {
    building = undefined;
    log(error, { adapter: 'worker', phase: 'build', status: 500 });
    throw error;
  }));

export default createBridge(async () => (await built()).ship, {
  log,
  graph: async () => {
    const { ship, introspection } = await built();
    return introspection?.options(ship).graph();
  },
  profile: async () => {
    const { ship, introspection } = await built();
    return introspection?.options(ship).profile();
  },
});
