import { defineModule, provide } from '@nexusdi/core';

import { type SimOptions, TICK_LOOP } from './simulation/contracts';
import { FixedStepLoop } from './simulation/fixed-step-loop';
import { Simulation } from './simulation/simulation.module';

/** The ship's systems over one simulation, seeded and stepped by `options`. */
export function meridianSystems(options: SimOptions) {
  return defineModule({
    name: 'MeridianSystems',
    global: true,
    imports: [Simulation.forRoot(options)],
    providers: [
      // all(SHIP_SYSTEMS) reads the systems this module can see: its imports and the globals.
      provide(TICK_LOOP, { useClass: FixedStepLoop }),
    ],
    exports: [TICK_LOOP],
  });
}
