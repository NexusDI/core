import { defineModule, type ModuleRef } from '@nexusdi/core';
import {
  MeridianSystems,
  ShipLifeSupport,
  Simulation,
  type SimOptions,
  SubspaceLink,
  Tactical,
  Telemetry,
} from '@nexusdi/meridian-systems';

// The FTL drive, which the bridge loads into a running ship. The graph target
// draws it with --load src/ship/meridian.module.ts#FtlDrive.
export { FtlDrive } from '@nexusdi/meridian-systems';

import { AlarmPanel } from './alarm-panel.module';
import { AuditTrail } from './audit-trail.module';
import type { SimMode } from './contracts';
import { MissionScope } from './mission-scope.module';
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

/**
 * The root named `name`: the kernel, the link when `link` is set, every
 * system, the bridge's own modules, and the system modules whose tokens the
 * routes read: Tactical for `/course`, ShipLifeSupport for the compartment
 * route and Telemetry for the stream. The kernel's tokens reach the routes
 * from the global Simulation.
 */
function bridgeShip(
  name: string,
  { sim, mode }: ShipSetup,
  link: readonly ModuleRef[],
) {
  const driver = SimDriver.forRoot({ mode });
  return defineModule({
    name,
    imports: [
      Simulation.forRoot(sim),
      ...link,
      MeridianSystems,
      Tactical,
      ShipLifeSupport,
      Telemetry,
      MissionScope,
      AuditTrail,
      AlarmPanel,
      driver,
    ],
    // A test that imports the root reads the driver and the audit log.
    exports: [driver, AuditTrail],
  });
}

/** The ship linked to the relay at `relayUrl`, which downloads its charts at startup. */
export function meridian(relayUrl: string, setup: ShipSetup = SEEDED) {
  return bridgeShip('Meridian', setup, [SubspaceLink.forRoot({ relayUrl })]);
}

/** The ship with no subspace link, over the bundled charts. */
export function offlineMeridian(setup: ShipSetup = SEEDED) {
  return bridgeShip('OfflineMeridian', setup, []);
}

/** The graph the CLI draws and the check test compiles. */
export const Meridian = meridian(DEFAULT_RELAY_URL);
export const OfflineMeridian = offlineMeridian();
