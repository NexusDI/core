import { defineModule } from '@nexusdi/core';
// The tactical module alone: the package index also holds the relay graph,
// whose relay URL the client bundle must not carry.
import { OfflineTactical } from '@nexusdi/bridge-api/offline';

/** The client graph: NAV_CHARTS over the bundled table, a singleton, so components read it outside a ScopeProvider (react spec 9.1). */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  imports: [OfflineTactical],
});
