import { defineModule } from '@nexusdi/core';

import { Tactical } from './tactical';

/** The client graph: NAV_CHARTS over the bundled table, a singleton, so components read it outside a ScopeProvider (react spec 9.1). */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  imports: [Tactical],
});
