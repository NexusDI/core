import { MISSION_HEADER, missionOf } from '@nexusdi/bridge-api/mission';
import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { nexus } from '@nexusdi/react-router';

import { BridgeConsole, bridgeServerPlugins } from './di/bridge.server';

export const ship = await Nexus.create(BridgeConsole, {
  plugins: bridgeServerPlugins,
});
import.meta.hot?.dispose(() => ship[Symbol.asyncDispose]());

export const di = nexus(ship, {
  request: ({ request }) => ({
    mission: missionOf(request.headers.get(MISSION_HEADER) ?? undefined),
    signal: request.signal,
  }),
  scopes: nodeScopes(),
});
