import { defineModule, provide } from '@nexusdi/core';
import {
  type Alarm,
  FTL_DRIVE,
  type FtlRating,
  type FtlRecord,
  type IAlarmSink,
  type IAtmosphereProbe,
  type IAtmosphereSensor,
  type IFtlDrive,
  type IShipState,
  type ISubspaceLink,
  type ITelemetryFeed,
  type ITickLoop,
  type QueuedCommand,
  SHIP_STATE,
  type ShipReading,
  type ShipSnapshot,
  type TelemetrySink,
  TICK_LOOP,
  type TickContext,
} from '@nexusdi/meridian-systems';
import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems/charts';

import type { IFlightLog, INavCharts } from '../src/ship/contracts';

/** A class, so the audit interceptor wraps it: interceptors skip value providers. */
export class FixedCharts implements INavCharts {
  /** It holds 42 for every star. */
  has() {
    return true;
  }
  plot(to: string) {
    return { to, heading: 42 };
  }
  stars() {
    return ['Kepler-442b'];
  }
}

export class FakeFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

/**
 * Sends one fixed frame to each sink and keeps the open ones, so a test sees
 * a client abort unsubscribe.
 */
export class RecordingFeed implements ITelemetryFeed {
  readonly sinks = new Set<TelemetrySink>();
  constructor(private readonly frame: ShipReading) {}
  subscribe(sink: TelemetrySink) {
    this.sinks.add(sink);
    sink.next(this.frame);
    return () => {
      this.sinks.delete(sink);
    };
  }
}

/** An analyzer whose read() throws a plain Error, as a bug in a sensor would. */
export class FailingSensor implements IAtmosphereSensor {
  read(): never {
    throw new Error('the analyzer failed');
  }
}

/** A probe whose read() throws a plain Error, so Safety raises SENSOR_FAULT. */
export class FailingProbe implements IAtmosphereProbe {
  read(): never {
    throw new Error('the probe failed');
  }
}

/** One call a sink heard from MasterAlarm. */
export interface HeardAlarm {
  readonly call: 'raise' | 'clear';
  readonly alarm: Alarm;
  readonly tick: number;
}

/** Keeps every raise and clear it hears, in order. */
export class RecordingAlarmSink implements IAlarmSink {
  readonly heard: HeardAlarm[] = [];
  raise(alarm: Alarm, tick: number) {
    this.heard.push({ call: 'raise', alarm, tick });
  }
  clear(alarm: Alarm, tick: number) {
    this.heard.push({ call: 'clear', alarm, tick });
  }
}

/** A subspace link that answers the bundled charts, so a linked ship starts with no network. */
export class FixedLink implements ISubspaceLink {
  async receive<T>(): Promise<T> {
    return BUNDLED_CHARTS as T;
  }
}

/**
 * An FTL drive with no spool to wait for: `spool()` and `jump(to)` queue
 * their setpoints with no check, and the drive's step fills the charge on
 * an armed tick and jumps on a commanded one with no pulse. Its rating draws
 * 0 W, and every field is finite, so a telemetry frame carries it as JSON.
 */
export class FakeJumpDrive implements IFtlDrive, Disposable {
  static deps = [TICK_LOOP, SHIP_STATE] as const;

  readonly rating: FtlRating = {
    energy: 90e9,
    power: 0,
    pulseShare: 0,
    reactorLevel: 0,
    coolantLimit: Number.MAX_VALUE,
  };

  private unregister: () => void = () => {};

  constructor(
    private readonly loop: ITickLoop,
    private readonly state: IShipState,
  ) {}

  onInit(): void {
    this.unregister = this.loop.register({
      name: 'FtlDrive',
      phase: 3,
      step: (ship, tick) => this.step(ship, tick),
    });
  }

  spool(): QueuedCommand {
    return this.state.queue({ ftl: { armed: true } });
  }

  jump(to: string): QueuedCommand {
    return this.state.queue({ ftl: { jump: to } });
  }

  [Symbol.dispose](): void {
    this.unregister();
  }

  private step(ship: ShipSnapshot, { tick }: TickContext): ShipSnapshot {
    const { ftl, setpoints } = ship;
    if (setpoints.ftl.jump !== null) {
      return Object.freeze({
        ...ship,
        ftl: Object.freeze({
          status: 'idle',
          charge: 0,
          sector: setpoints.ftl.jump,
          jumped: tick,
        }),
        setpoints: Object.freeze({
          ...setpoints,
          ftl: Object.freeze({ armed: false, jump: null }),
        }),
      });
    }
    const write = (next: FtlRecord): ShipSnapshot =>
      Object.freeze({ ...ship, ftl: Object.freeze(next) });
    // The first unarmed step after the load writes idle, as the drive's does.
    if (ftl.status === 'offline' && !setpoints.ftl.armed) {
      return write({ ...ftl, status: 'idle' });
    }
    if (!setpoints.ftl.armed || ftl.status === 'charged') return ship;
    return write({ ...ftl, status: 'charged', charge: this.rating.energy });
  }
}

/** Stands in for FtlDrive with `overrideModule(FtlDrive, FakeFtlDrive, { lazy: true })`. */
export const FakeFtlDrive = defineModule({
  name: 'FakeFtlDrive',
  providers: [provide(FTL_DRIVE, { useClass: FakeJumpDrive })],
  exports: [FTL_DRIVE],
});
