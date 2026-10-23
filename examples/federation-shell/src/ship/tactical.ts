import { defineModule, provide } from '@nexusdi/core';
import {
  COMMAND_LINK,
  NAV_CHARTS,
  TELEMETRY_FEED,
} from '@nexusdi/federation-contracts';

import { BridgeCommandLink } from './bridge-command-link';
import { BRIDGE_ENDPOINT, RuntimeBridgeEndpoint } from './bridge-endpoint';
import { BridgeTelemetry } from './bridge-telemetry';
import { StarCharts } from './star-charts';

/**
 * The contract module. A remote's section is loaded with `load()`, and a
 * loaded module sees only what it imports or what a global module exports.
 * A remote cannot import this module object, so `Tactical` is global.
 * BRIDGE_ENDPOINT stays inside: only the shell's classes read it.
 */
export const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts }),
    provide(BRIDGE_ENDPOINT, { useClass: RuntimeBridgeEndpoint }),
    provide(TELEMETRY_FEED, { useClass: BridgeTelemetry }),
    provide(COMMAND_LINK, { useClass: BridgeCommandLink }),
  ],
  exports: [NAV_CHARTS, TELEMETRY_FEED, COMMAND_LINK],
  global: true,
});
