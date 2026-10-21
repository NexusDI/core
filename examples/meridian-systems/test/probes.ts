import { Token } from '@nexusdi/core';

import {
  type IShipSystem,
  type ITickLoop,
  type Phase,
  type ShipSnapshot,
  TICK_LOOP,
  type TickContext,
} from '../src/simulation/contracts';

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

export class ProbeLog implements IProbeLog {
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

export class ProbeReactor extends ProbeSystem {
  readonly name = 'ProbeReactor';
  // The tick loop reads phase through IShipSystem, which fallow does not follow.
  // fallow-ignore-next-line unused-class-member
  readonly phase = 1;
}

export class ProbeSensor extends ProbeSystem {
  readonly name = 'ProbeSensor';
  // The tick loop reads phase through IShipSystem, which fallow does not follow.
  // fallow-ignore-next-line unused-class-member
  readonly phase = 2;
}

/** Reads TICK_LOOP from inside an imported module, as MasterAlarm and JumpDrive will. */
export class LoopWatch implements ILoopWatch {
  static deps = [TICK_LOOP] as const;
  constructor(readonly loop: ITickLoop) {}
}
