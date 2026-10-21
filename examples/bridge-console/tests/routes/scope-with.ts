import type { Nexus, Scope } from '@nexusdi/core';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { createTestingContainer } from '@nexusdi/testing';
import { RouterContextProvider } from 'react-router';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import type { FakeBridgeLink } from '../doubles';

/**
 * A request scope of a BridgeConsole container whose BRIDGE_LINK is an
 * instance of `link`, the link double or a subclass of it. The test disposes the scope, and `built` collects the
 * container for the file's afterAll.
 */
export async function scopeWith(
  link: typeof FakeBridgeLink,
  built: Nexus[],
): Promise<Scope> {
  const ship = await createTestingContainer(BridgeConsole)
    .override(BRIDGE_LINK, { useClass: link, lifetime: 'scoped' })
    .create();
  built.push(ship);
  return ship.createScope({
    request: { mission: { id: 'survey-9', target: 'Kepler-442b' } },
  });
}

/** The router context of a request that `scope` serves. */
export const contextOf = (scope: Scope) =>
  new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]]));

/** The arguments React Router passes a loader for `path`, served by `scope`. */
export const loaderArgs = (scope: Scope, path: string) =>
  ({
    params: {},
    context: contextOf(scope),
    request: new Request(`http://bridge${path}`),
  }) as never;
