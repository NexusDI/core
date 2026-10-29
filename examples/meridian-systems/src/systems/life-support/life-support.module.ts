import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import {
  DECK_PLAN,
  SHIP_FILES,
  SHIP_SYSTEMS,
} from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';

import { CalibratedProbe } from './calibrated-probe';
import {
  ATMOSPHERE_CONTROL,
  ATMOSPHERE_PROBE,
  ATMOSPHERE_SENSOR,
  LIFE_SUPPORT_OPTIONS,
} from './contracts';
import { EnvironmentalController } from './environmental-controller';
import { GasAnalyzer } from './gas-analyzer';
import { LIFE_SUPPORT_OPTIONS_SCHEMA } from './life-support-options-schema';
import { LifeSupportCommands } from './life-support-commands';
import { LifeSupportPhysics } from './life-support-physics';
import { LifeSupportPower } from './life-support-power';
import { readCalibration } from './read-calibration';

/** The air of every compartment, stepped in phase 4, its probe, its analyzers and its panel. */
export const LifeSupport = defineModule({
  name: 'LifeSupport',
  options: LIFE_SUPPORT_OPTIONS,
  schema: LIFE_SUPPORT_OPTIONS_SCHEMA,
  providers: [
    provide(ATMOSPHERE_PROBE, { useClass: CalibratedProbe }),
    // Transient: each get() samples the scope's compartment at the current tick.
    provide(ATMOSPHERE_SENSOR, {
      useClass: GasAnalyzer,
      lifetime: 'transient',
    }),
    provide(ATMOSPHERE_CONTROL, { useClass: EnvironmentalController }),
    provide(SHIP_SYSTEMS, { useClass: LifeSupportPhysics }),
    provide(POWER_CONSUMERS, { useClass: LifeSupportPower }),
    provide(COMMAND_HANDLERS, { useClass: LifeSupportCommands }),
  ],
  exports: [
    ATMOSPHERE_PROBE,
    ATMOSPHERE_SENSOR,
    ATMOSPHERE_CONTROL,
    SHIP_SYSTEMS,
    POWER_CONSUMERS,
    COMMAND_HANDLERS,
  ],
});

/**
 * The ship's one configured `LifeSupport`, with the calibration read at
 * startup through `SHIP_FILES`. Core keys a module by its definition, so `Safety` and
 * `MeridianSystems` import this one object and the graph holds one life
 * support. A second `forRootAsync()` call would add a second module with a
 * second `ATMOSPHERE_PROBE`.
 */
export const ShipLifeSupport = LifeSupport.forRootAsync({
  deps: [SHIP_FILES, DECK_PLAN],
  useFactory: readCalibration,
});
