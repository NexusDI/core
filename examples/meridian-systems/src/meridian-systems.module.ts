import { defineModule, provide } from '@nexusdi/core';

import { CommandDesk } from './simulation/command-desk';
import { COMMAND_DESK } from './simulation/commands';
import { type SimOptions, TICK_LOOP } from './simulation/contracts';
import { FixedStepLoop } from './simulation/fixed-step-loop';
import { Simulation } from './simulation/simulation.module';
import { Engineering } from './systems/engineering/engineering.module';
import { TELEMETRY } from './telemetry/contracts';
import { Telemetry } from './telemetry/telemetry.module';

/** The ship's systems over one simulation, seeded and stepped by `options`, and its telemetry feed. */
export function meridianSystems(options: SimOptions) {
  return defineModule({
    name: 'MeridianSystems',
    global: true,
    imports: [Simulation.forRoot(options), Telemetry, Engineering],
    providers: [
      // all(SHIP_SYSTEMS) reads this module's own providers plus the exports of
      // its imports and of the global modules.
      provide(TICK_LOOP, { useClass: FixedStepLoop }),
      // all(COMMAND_HANDLERS) reads this module's own providers plus the
      // exports of its imports and of the global modules.
      provide(COMMAND_DESK, { useClass: CommandDesk }),
    ],
    exports: [TICK_LOOP, TELEMETRY, COMMAND_DESK, Engineering],
  });
}
