import { defineModule, provide, Token } from '@nexusdi/core';

import {
  type IShipSystem,
  type ITickLoop,
  type Phase,
  SHIP_SYSTEMS,
  type ShipSnapshot,
  TICK_LOOP,
  type TickContext,
} from '../src/simulation/contracts';
import { FixedStepLoop } from '../src/simulation/fixed-step-loop';
import { Simulation } from '../src/simulation/simulation.module';

export interface IProbeLog {
  /** `<system>@<tick>`, in the order the systems stepped. */
  readonly entries: readonly string[];
  record(entry: string): void;
}

export interface ILoopWatch {
  readonly loop: ITickLoop;
}

export const PROBE_LOG = new Token<IProbeLog>('ProbeLog');
export const LOOP_WATCH = new Token<ILoopWatch>('LoopWatch');

class ProbeLog implements IProbeLog {
  readonly entries: string[] = [];
  record(entry: string): void {
    this.entries.push(entry);
  }
}

/** Passes the ship on unchanged and logs its name and the tick. */
abstract class ProbeSystem implements IShipSystem {
  static deps = [PROBE_LOG] as const;
  abstract readonly name: string;
  abstract readonly phase: Phase;
  constructor(private readonly log: IProbeLog) {}
  step(ship: ShipSnapshot, tick: TickContext): ShipSnapshot {
    this.log.record(`${this.name}@${tick.tick}`);
    return ship;
  }
}

class ProbeReactor extends ProbeSystem {
  readonly name = 'ProbeReactor';
  readonly phase = 1;
}

class ProbeSensor extends ProbeSystem {
  readonly name = 'ProbeSensor';
  readonly phase = 2;
}

/** Reads TICK_LOOP from inside an imported module, as MasterAlarm and JumpDrive will. */
class LoopWatch implements ILoopWatch {
  static deps = [TICK_LOOP] as const;
  constructor(readonly loop: ITickLoop) {}
}

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

/** The root `meridianSystems()` builds, written out with the probe systems imported beside the simulation. */
export const ShipUnderTest = defineModule({
  name: 'ShipUnderTest',
  global: true,
  imports: [Simulation.forRoot({ seed: 1, dt: 1 }), ProbeSystems],
  providers: [
    // all(SHIP_SYSTEMS) reads the systems this module can see: its imports and the globals.
    provide(TICK_LOOP, { useClass: FixedStepLoop }),
  ],
  exports: [TICK_LOOP],
});
