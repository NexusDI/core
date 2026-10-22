import { defineModule, provide } from '@nexusdi/core';

import { CommandDesk } from './simulation/command-desk';
import { COMMAND_DESK } from './simulation/commands';
import { DECK_PLAN, type SimOptions, TICK_LOOP } from './simulation/contracts';
import { FixedStepLoop } from './simulation/fixed-step-loop';
import { Simulation } from './simulation/simulation.module';
import { Engineering } from './systems/engineering/engineering.module';
import { LifeSupport } from './systems/life-support/life-support.module';
import { readCalibration } from './systems/life-support/read-calibration';
import { Safety } from './systems/safety/safety.module';
import { TELEMETRY } from './telemetry/contracts';
import { Telemetry } from './telemetry/telemetry.module';

/**
 * LifeSupport with its options, read at startup. The aggregate imports and
 * re-exports this one instance, so the root and Engineering's router read the
 * LifeSupport the aggregate imported.
 */
const ConfiguredLifeSupport = LifeSupport.forRootAsync({
  deps: [DECK_PLAN],
  useFactory: readCalibration,
});

/** The ship's systems over one simulation, seeded and stepped by `options`, and its telemetry feed. */
export function meridianSystems(options: SimOptions) {
  return defineModule({
    name: 'MeridianSystems',
    global: true,
    imports: [
      Simulation.forRoot(options),
      Telemetry,
      Engineering,
      ConfiguredLifeSupport,
      Safety,
    ],
    providers: [
      // all(SHIP_SYSTEMS) reads this module's own providers plus the exports of
      // its imports and of the global modules.
      provide(TICK_LOOP, { useClass: FixedStepLoop }),
      // all(COMMAND_HANDLERS) reads this module's own providers plus the
      // exports of its imports and of the global modules.
      provide(COMMAND_DESK, { useClass: CommandDesk }),
    ],
    // Re-exporting Engineering hands the root REACTOR, POWER_ROUTER and
    // SHIELD_GRID. COOLANT_LOOP stays inside Engineering. Re-exporting
    // LifeSupport hands the root ATMOSPHERE_PROBE, ATMOSPHERE_SENSOR and
    // ATMOSPHERE_CONTROL, and puts its POWER_CONSUMERS entry where
    // Engineering's router reads it. Re-exporting Safety hands the root
    // BLAST_DOORS, FIRE_SUPPRESSION and MASTER_ALARM.
    exports: [
      TICK_LOOP,
      TELEMETRY,
      COMMAND_DESK,
      Engineering,
      ConfiguredLifeSupport,
      Safety,
    ],
  });
}
