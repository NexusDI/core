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
