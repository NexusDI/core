import { defineModule, provide } from '@nexusdi/core';
import {
  COMMAND_LINK,
  NAV_CHARTS,
  STATION_TELEMETRY,
} from '@nexusdi/federation-contracts';

import { BridgeCommandLink } from './bridge-command-link';
import { BRIDGE_ENDPOINT, RuntimeBridgeEndpoint } from './bridge-endpoint';
import { BridgeTelemetry } from './bridge-telemetry';
import { StarCharts } from './star-charts';

/**
 * The contract module. A remote's section is loaded with `load()`, and a
 * remote cannot import this module object, so the shell imports `Tactical` into
 * each station's load with `{ imports: [Tactical] }`. The shell's root
 * imports it, and no module but the importing stations sees it. BRIDGE_ENDPOINT stays inside:
 * only the shell's classes read it.
 */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts }),
    provide(BRIDGE_ENDPOINT, { useClass: RuntimeBridgeEndpoint }),
    provide(STATION_TELEMETRY, { useClass: BridgeTelemetry }),
    provide(COMMAND_LINK, { useClass: BridgeCommandLink }),
  ],
  exports: [NAV_CHARTS, STATION_TELEMETRY, COMMAND_LINK],
});
