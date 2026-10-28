import { MISSION_HEADER, missionOf } from '@nexusdi/bridge-api/mission';
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { nodeScopes } from '@nexusdi/node';
import { nexus } from '@nexusdi/react-router';

import { BridgeConsole } from './bridge/bridge-console';

export const ship = await Nexus.create(BridgeConsole, {
  plugins: import.meta.env.DEV ? [errors()] : [],
});
import.meta.hot?.dispose(() => ship[Symbol.asyncDispose]());

export const di = nexus(ship, {
  request: ({ request }) => ({
    mission: missionOf(request.headers.get(MISSION_HEADER) ?? undefined),
    signal: request.signal,
  }),
  scopes: nodeScopes(),
});
