import { defineModule, type ModuleRef, provide } from '@nexusdi/core';

import { SHIP_SYSTEMS } from '../src/simulation/contracts';
import { Simulation } from '../src/simulation/simulation.module';
import { Telemetry } from '../src/telemetry/telemetry.module';

import {
  FakeLoopWatch,
  FakeReactor,
  FakeSensor,
  LOOP_WATCH,
  PROBE_LOG,
  RecordingProbeLog,
} from './support';

/** Two fake systems and a log, for the cases that watch the loop run them. */
export const ProbeSystems = defineModule({
  name: 'ProbeSystems',
  providers: [
    provide(PROBE_LOG, { useClass: RecordingProbeLog }),
    // Listed against phase order, so the test sees the loop sort them.
    provide(SHIP_SYSTEMS, { useClass: FakeSensor }),
    provide(SHIP_SYSTEMS, { useClass: FakeReactor }),
    provide(LOOP_WATCH, { useClass: FakeLoopWatch }),
  ],
  exports: [PROBE_LOG, SHIP_SYSTEMS, LOOP_WATCH],
});

/**
 * A root of the simulation and the telemetry with `system` imported beside
 * them. The tick loop in `Simulation` collects every `SHIP_SYSTEMS`
 * contribution that `system` publishes, so the root needs no loop of its own.
 */
export function shipUnderTest(system: ModuleRef) {
  return defineModule({
    name: 'ShipUnderTest',
    imports: [
      // test/fixtures.ts overrides SIM_OPTIONS with SHIP_OPTIONS. These
      // values differ from the override on purpose: the idle case in
      // test/simulation.test.ts reads time 300 after 600 ticks only when the
      // override applied, since dt 1 would read 600.
      Simulation.forRoot({ seed: 1, dt: 1 }),
      system,
      Telemetry,
    ],
  });
}
