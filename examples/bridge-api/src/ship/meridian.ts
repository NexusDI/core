import { defineModule } from '@nexusdi/core';
import { meridianSystems, type SimOptions } from '@nexusdi/meridian-systems';

import { AlarmPanel } from './alarm-panel.module';
import { AuditTrail } from './audit-trail.module';
import { BridgeApi } from './bridge-api.module';
import type { SimMode } from './contracts';
import { SimDriver } from './sim-driver.module';
import { OfflineTactical, tactical } from './tactical.module';

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

export function meridian(relayUrl: string, setup: ShipSetup = SEEDED) {
  return defineModule({
    name: 'Meridian',
    imports: [
      tactical(relayUrl),
      BridgeApi,
      AuditTrail,
      AlarmPanel,
      meridianSystems(setup.sim),
      SimDriver.forRoot({ mode: setup.mode }),
    ],
  });
}

export function offlineMeridian(setup: ShipSetup = SEEDED) {
  return defineModule({
    name: 'OfflineMeridian',
    imports: [
      OfflineTactical,
      BridgeApi,
      AuditTrail,
      AlarmPanel,
      meridianSystems(setup.sim),
      SimDriver.forRoot({ mode: setup.mode }),
    ],
  });
}

/** The graph the CLI draws and the check test compiles. */
export const Meridian = meridian(DEFAULT_RELAY_URL);
export const OfflineMeridian = offlineMeridian();
