import { defineModule } from '@nexusdi/core';

import { Audit } from './audit';
import { BridgeApi } from './bridge-api.module';
import { OfflineTactical, tactical } from './tactical.module';

export const DEFAULT_RELAY_URL = 'https://relay.meridian.invalid';

export function meridian(relayUrl: string) {
  return defineModule({
    name: 'Meridian',
    imports: [tactical(relayUrl), BridgeApi, Audit],
  });
}

/** The graph the CLI draws and the check test compiles. */
export const Meridian = meridian(DEFAULT_RELAY_URL);
export const OfflineMeridian = defineModule({
  name: 'OfflineMeridian',
  imports: [OfflineTactical, BridgeApi, Audit],
});
