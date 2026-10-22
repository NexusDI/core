import { defineModule } from '@nexusdi/core';
import {
  meridianSystems,
  type MeridianSystemsOptions,
  type SimOptions,
} from '@nexusdi/meridian-systems';

import { AlarmPanel } from './alarm-panel.module';
import { AuditTrail } from './audit-trail.module';
import { BridgeApi } from './bridge-api.module';
import type { SimMode } from './contracts';
import { SimDriver } from './sim-driver.module';

export const DEFAULT_RELAY_URL = 'https://relay.meridian.invalid';

/** The simulation a ship runs and how its driver advances it. */
export interface ShipSetup {
  readonly sim: SimOptions;
  readonly mode: SimMode;
}

/**
 * The static graphs run manual, so a test or a Worker that builds them starts
 * no timer. `setupFromEnv` defaults to live for the Node servers.
 */
export const SEEDED: ShipSetup = { sim: { seed: 7, dt: 0.5 }, mode: 'manual' };

/** The root named `name`: the bridge's modules over the ship's systems. */
function bridgeShip(
  name: string,
  systems: MeridianSystemsOptions,
  mode: SimMode,
) {
  return defineModule({
    name,
    imports: [
      BridgeApi,
      AuditTrail,
      AlarmPanel,
      meridianSystems(systems),
      SimDriver.forRoot({ mode }),
    ],
  });
}

/** The ship linked to the relay at `relayUrl`, which downloads its charts at startup. */
export function meridian(relayUrl: string, setup: ShipSetup = SEEDED) {
  return bridgeShip('Meridian', { ...setup.sim, relayUrl }, setup.mode);
}

/** The ship with no subspace link, over the bundled charts. */
export function offlineMeridian(setup: ShipSetup = SEEDED) {
  return bridgeShip('OfflineMeridian', setup.sim, setup.mode);
}

/** The graph the CLI draws and the check test compiles. */
export const Meridian = meridian(DEFAULT_RELAY_URL);
export const OfflineMeridian = offlineMeridian();
