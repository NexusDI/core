import type {
  Alarm,
  IAlarmSink,
  IAtmosphereProbe,
  IAtmosphereSensor,
  ITelemetryFeed,
  ShipReading,
  TelemetrySink,
} from '@nexusdi/meridian-systems';

import type { IFlightLog, INavCharts } from '../src/ship/contracts';

/** A class, so the audit interceptor wraps it: interceptors skip value providers. */
export class FakeCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}

export class MemoryFlightLog implements IFlightLog {
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
export class MemoryAlarmSink implements IAlarmSink {
  readonly heard: HeardAlarm[] = [];
  raise(alarm: Alarm, tick: number) {
    this.heard.push({ call: 'raise', alarm, tick });
  }
  clear(alarm: Alarm, tick: number) {
    this.heard.push({ call: 'clear', alarm, tick });
  }
}
