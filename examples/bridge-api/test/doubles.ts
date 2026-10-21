import type {
  ITelemetryFeed,
  ShipSnapshot,
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
  constructor(private readonly frame: ShipSnapshot) {}
  subscribe(sink: TelemetrySink) {
    this.sinks.add(sink);
    sink.next(this.frame);
    return () => {
      this.sinks.delete(sink);
    };
  }
}
