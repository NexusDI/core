import { defineModule, provide } from '@nexusdi/core';

import { SHIP_SYSTEMS, TICK_LOOP } from '../src/simulation/contracts';
import { FixedStepLoop } from '../src/simulation/fixed-step-loop';
import { Simulation } from '../src/simulation/simulation.module';
import { Telemetry } from '../src/telemetry/telemetry.module';

import {
  LOOP_WATCH,
  LoopWatch,
  PROBE_LOG,
  ProbeLog,
  ProbeReactor,
  ProbeSensor,
} from './probes';

const ProbeSystems = defineModule({
  name: 'ProbeSystems',
  providers: [
    provide(PROBE_LOG, { useClass: ProbeLog }),
    // Listed against phase order, so the test sees the loop sort them.
    provide(SHIP_SYSTEMS, { useClass: ProbeSensor }),
    provide(SHIP_SYSTEMS, { useClass: ProbeReactor }),
    provide(LOOP_WATCH, { useClass: LoopWatch }),
  ],
  exports: [PROBE_LOG, SHIP_SYSTEMS, LOOP_WATCH],
});

/** The root `meridianSystems()` builds, written out with the probe systems imported beside the simulation and the telemetry. */
export const ShipUnderTest = defineModule({
  name: 'ShipUnderTest',
  global: true,
  imports: [
    // test/fixtures.ts overrides SIM_OPTIONS with { seed: 7, dt: 0.5 }. These
    // values differ from the override on purpose: the idle case in
    // test/simulation.test.ts reads time 300 after 600 ticks only when the
    // override applied, since dt 1 would read 600.
    Simulation.forRoot({ seed: 1, dt: 1 }),
    ProbeSystems,
    Telemetry,
  ],
  providers: [
    // all(SHIP_SYSTEMS) reads this module's own providers plus the exports of
    // its imports and of the global modules.
    provide(TICK_LOOP, { useClass: FixedStepLoop }),
  ],
  exports: [TICK_LOOP],
});
