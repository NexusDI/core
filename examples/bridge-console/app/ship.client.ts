import { Nexus } from '@nexusdi/core';

import { BridgeClient } from './di/bridge.client';

/** The client container. Only entry.client.tsx imports this file, so it runs in the browser alone. */
export const shipReady = Nexus.create(BridgeClient);
