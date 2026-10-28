import { defineModule, provide } from '@nexusdi/core';

import { CommandDesk } from './simulation/command-desk';
import { COMMAND_DESK } from './simulation/commands';
import { DECK_PLAN, type SimOptions, TICK_LOOP } from './simulation/contracts';
import { FixedStepLoop } from './simulation/fixed-step-loop';
import { Simulation } from './simulation/simulation.module';
import { Comms, OfflineComms } from './systems/comms/comms.module';
import { Engineering } from './systems/engineering/engineering.module';
import { Helm } from './systems/helm/helm.module';
import { LifeSupport } from './systems/life-support/life-support.module';
import { readCalibration } from './systems/life-support/read-calibration';
import { Propulsion } from './systems/propulsion/propulsion.module';
import { Safety } from './systems/safety/safety.module';
import { OfflineTactical, Tactical } from './systems/tactical/tactical.module';
import { Weapons } from './systems/weapons/weapons.module';
import { TELEMETRY } from './telemetry/contracts';
import { Telemetry } from './telemetry/telemetry.module';

/** The simulation's seed and step, and the relay the subspace link calls. */
export interface MeridianSystemsOptions extends SimOptions {
  /** The relay's base URL. Without one the ship has no subspace link. */
  readonly relayUrl?: string;
  /** How long the ship waits for the relay's answer at startup, in ms. Defaults to 5000. */
  readonly relayTimeout?: number;
}

/**
 * LifeSupport with its options, read at startup. The aggregate imports and
 * re-exports this one instance, so the root and Engineering's router read the
 * LifeSupport the aggregate imported.
 */
const ConfiguredLifeSupport = LifeSupport.forRootAsync({
  deps: [DECK_PLAN],
  useFactory: readCalibration,
});

/**
 * The ship's systems over one simulation, seeded and stepped by `seed` and
 * `dt`, and its telemetry feed. With `relayUrl` the ship links to that relay
 * and downloads its charts at startup.
 */
export function meridianSystems({
  relayUrl,
  relayTimeout,
  seed,
  dt,
}: MeridianSystemsOptions) {
  // A configured Comms binds its link, so the offline ship takes the pair
  // that binds none.
  const [comms, tactical] =
    relayUrl === undefined
      ? [OfflineComms, OfflineTactical]
      : [Comms.forRoot({ relayUrl, relayTimeout }), Tactical];
  return defineModule({
    name: 'MeridianSystems',
    global: true,
    imports: [
      Simulation.forRoot({ seed, dt }),
      Telemetry,
      Engineering,
      ConfiguredLifeSupport,
      Safety,
      comms,
      tactical,
      Propulsion,
      Helm,
      Weapons,
    ],
    providers: [
      // all(SHIP_SYSTEMS) in the loop and all(COMMAND_HANDLERS) in the desk
      // read this module's own providers plus the contributions of every
      // module that names SHIP_SYSTEMS or COMMAND_HANDLERS in its exports.
      provide(TICK_LOOP, { useClass: FixedStepLoop }),
      provide(COMMAND_DESK, { useClass: CommandDesk }),
    ],
    // A re-export makes a module's plain tokens visible to the root and to
    // every module that sees this global module. Multi tokens do not travel
    // that way: SHIP_SYSTEMS, COMMAND_HANDLERS and POWER_CONSUMERS reach
    // their readers because each system lists them in its own exports.
    // Re-exporting Engineering hands the root REACTOR, POWER_ROUTER and
    // SHIELD_GRID. COOLANT_LOOP stays inside Engineering. Re-exporting
    // LifeSupport hands the root ATMOSPHERE_PROBE, ATMOSPHERE_SENSOR and
    // ATMOSPHERE_CONTROL. Re-exporting Safety hands the root BLAST_DOORS,
    // FIRE_SUPPRESSION and MASTER_ALARM. The comms export hands the root
    // COMMS_ARRAY and SUBSPACE_LINK, a plain token that Tactical's factory
    // reads through this re-export. The tactical export hands the root
    // NAV_CHARTS. The Propulsion export hands the root MAIN_DRIVE, which
    // HelmControl reads. The Helm export hands the root THRUSTERS and HELM.
    // The Weapons export hands the root WEAPON_MOUNT.
    exports: [
      TICK_LOOP,
      TELEMETRY,
      COMMAND_DESK,
      Engineering,
      ConfiguredLifeSupport,
      Safety,
      comms,
      tactical,
      Propulsion,
      Helm,
      Weapons,
    ],
  });
}
