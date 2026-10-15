import { Nexus } from '@nexusdi/core';

import { BridgeClient } from './bridge/client.module';

export const shipReady = Nexus.create(BridgeClient);
