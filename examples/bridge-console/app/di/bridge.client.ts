import { defineModule } from '@nexusdi/core';

import { Tactical } from './tactical.module';
import { TelemetryClient } from './telemetry-client.module';

/**
 * The client graph: NAV_CHARTS over the bundled table and TELEMETRY_CLIENT,
 * both singletons, so components read them outside a ScopeProvider.
 */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  imports: [Tactical, TelemetryClient],
});
