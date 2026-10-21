import { defineModule } from '@nexusdi/core';

import { Tactical } from './tactical';
import { TelemetryClient } from './telemetry-client';

/**
 * The client graph: NAV_CHARTS over the bundled table and TELEMETRY_CLIENT,
 * both singletons, so components read them outside a ScopeProvider (react
 * spec 9.1).
 */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  imports: [Tactical, TelemetryClient],
});
