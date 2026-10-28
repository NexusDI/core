import { Token } from '@nexusdi/core';
import { interceptors } from '@nexusdi/interceptors';

import type { ICommandDesk } from '../src/simulation/commands';
import {
  type IShipSystem,
  type ITickLoop,
  type Phase,
  type ShipSnapshot,
  TICK_LOOP,
  type TickContext,
} from '../src/simulation/contracts';
import type { IFtlDrive } from '../src/systems/ftl/contracts';
import {
  type Alarm,
  BLAST_DOORS,
  type IAlarmSink,
} from '../src/systems/safety/contracts';
import { PressureInterlock } from '../src/systems/safety/pressure-interlock';
import type { TelemetrySink } from '../src/telemetry/contracts';

/** The seed and step every test builds its ship with. */
export const SHIP_OPTIONS = { seed: 7, dt: 0.5 };

/** The relay URL a test stubs `fetch` for. */
export const RELAY_URL = 'https://relay.test';

/** The plugin that runs the pressure interlock before `BLAST_DOORS.open`. */
export const INTERLOCK_PLUGINS = [
  interceptors({
    register: [PressureInterlock],
    bindings: [{ token: BLAST_DOORS, methods: { open: [PressureInterlock] } }],
  }),
];

/** Queues a reactor throttle of `level` on `desk`. */
export const throttle = (desk: ICommandDesk, level: number) =>
  desk.submit({ system: 'engineering', action: 'throttle', level });

/** Queues life support online on `desk`. */
export const online = (desk: ICommandDesk) =>
  desk.submit({ system: 'life-support', action: 'online' });

/** The load the router allocated `id` on `ship`. */
export const loadOf = (ship: ShipSnapshot, id: string) =>
  ship.power.loads.find((entry) => entry.id === id);

/**
 * What `fn` throws. A function that returns a promise gives the promise's
 * rejection. Read the result with `isNexusError`, which narrows it to the
 * class of a code. A call that does not throw fails the test.
 */
export function caught(fn: () => Promise<unknown>): Promise<unknown>;
export function caught(fn: () => unknown): unknown;
export function caught(fn: () => unknown): unknown {
  const missing = () => new Error('the call returned without throwing');
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => {
          throw missing();
        },
        (error: unknown) => error,
      );
    }
  } catch (error) {
    return error;
  }
  throw missing();
}

/** An alarm sink that writes each call as an audit line would read it. */
export class RecordingAlarmSink implements IAlarmSink {
  readonly calls: string[] = [];
  raise(alarm: Alarm, tick: number): void {
    this.calls.push(`raised ${alarm.code} ${alarm.subject} at tick ${tick}`);
  }
  clear(alarm: Alarm, tick: number): void {
    this.calls.push(`cleared ${alarm.code} ${alarm.subject} at tick ${tick}`);
  }
}

/** A telemetry sink that keeps the tick of each frame and the reason of each close. */
export class RecordingTelemetrySink implements TelemetrySink {
  readonly frames: number[] = [];
  readonly closed: string[] = [];
  next(frame: { readonly tick: number }): void {
    this.frames.push(frame.tick);
  }
  close(reason: string): void {
    this.closed.push(reason);
  }
}

/** A drive that refuses every command, for a module the graph never builds. */
export class FailingFtlDrive implements IFtlDrive {
  readonly rating = {
    energy: 0,
    power: 0,
    pulseShare: 0,
    reactorLevel: 0,
    coolantLimit: 0,
  };
  spool(): never {
    throw new Error('the graph builds nothing');
  }
  jump(): never {
    throw new Error('the graph builds nothing');
  }
}

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

export class RecordingProbeLog implements IProbeLog {
  readonly entries: string[] = [];
  record(entry: string): void {
    this.entries.push(entry);
  }
}

/** Passes the ship on unchanged and logs its name and the tick. */
abstract class FakeSystem implements IShipSystem {
  static deps = [PROBE_LOG] as const;
  abstract readonly name: string;
  abstract readonly phase: Phase;
  constructor(private readonly log: IProbeLog) {}
  step(ship: ShipSnapshot, tick: TickContext): ShipSnapshot {
    this.log.record(`${this.name}@${tick.tick}`);
    return ship;
  }
}

export class FakeReactor extends FakeSystem {
  readonly name = 'ProbeReactor';
  // The tick loop reads phase through IShipSystem, which FakeReactor inherits from FakeSystem,
  // and fallow only follows an implements clause on the class itself.
  // fallow-ignore-next-line unused-class-member
  readonly phase = 1;
}

export class FakeSensor extends FakeSystem {
  readonly name = 'ProbeSensor';
  // The tick loop reads phase through IShipSystem, which FakeSensor inherits from FakeSystem,
  // and fallow only follows an implements clause on the class itself.
  // fallow-ignore-next-line unused-class-member
  readonly phase = 2;
}

/** Reads TICK_LOOP from inside an imported module, as MasterAlarm and JumpDrive will. */
export class FakeLoopWatch implements ILoopWatch {
  static deps = [TICK_LOOP] as const;
  constructor(readonly loop: ITickLoop) {}
}
