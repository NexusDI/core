import type { Nexus } from '@nexusdi/core';
import * as devtools from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { introspect } from '../bridge/profile';
import { introspectionFromEnv } from './env';
import { shipLog } from './log';
import { shipFromEnv } from './ship';

/**
 * What every Node entry builds before it picks a server: the scopes the
 * bridge runs each request in, the ship (with the introspection plugins when
 * SHIP_INTROSPECTION is on), a shutdown controller, and the bridge options
 * the three share. The caller disposes the ship, as `await using ship = parts.ship`
 * or from the server's close hook.
 */
export async function nodeBridgeParts(env: NodeJS.ProcessEnv = process.env) {
  // The bridge runs each request in its scope, and the flight recorder reads it.
  const scopes = nodeScopes();
  const introspection = introspectionFromEnv(env)
    ? introspect(devtools)
    : undefined;
  const ship: Nexus = await shipFromEnv(scopes, env, introspection?.plugins);
  const shutdown = new AbortController();
  return {
    scopes,
    ship,
    shutdown,
    options: {
      scopes,
      log: shipLog(),
      ...introspection?.options(ship),
      shutdown: shutdown.signal,
    },
  };
}
