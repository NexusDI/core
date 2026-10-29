import { Nexus } from '@nexusdi/core';

import type { IScopeSource } from '../ship/contracts';
import { meridian, offlineMeridian } from '../ship/meridian.module';
import { bridgePlugins } from '../ship/plugins';
import { type Env, isDev, setupFromEnv } from './env';
import { NodeShipFiles, shipFilesDir } from './ship-files';

/**
 * The container the Node servers start: the relay graph when RELAY_URL is
 * set, the offline graph otherwise, with errors() and devtools() outside
 * production. The ship reads its files from the library's deck folder on
 * disk. The flight recorder reads the request scope from `scopes`, the
 * same ones the entry hands the bridge.
 */
export function shipFromEnv(
  scopes?: IScopeSource,
  env: Env = process.env,
): Promise<Nexus> {
  const { sim, mode } = setupFromEnv(env);
  const setup = {
    sim: { ...sim, files: new NodeShipFiles(shipFilesDir()) },
    mode,
  };
  const root = env.RELAY_URL
    ? meridian(env.RELAY_URL, setup)
    : offlineMeridian(setup);
  return Nexus.create(root, {
    plugins: bridgePlugins({ dev: isDev(env), scopes }),
  });
}
