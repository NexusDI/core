import type {
  IStationTelemetry,
  TelemetryReading,
  TelemetryState,
} from '@nexusdi/federation-contracts';

import { BRIDGE_ENDPOINT, type IBridgeEndpoint } from './bridge-endpoint';

const OFFLINE: TelemetryState = Object.freeze({
  status: 'offline',
  reading: null,
});

/**
 * Reads bridge-api's `GET /telemetry` through an EventSource. The first
 * listener opens the source once the endpoint answers, and the last one's
 * unsubscribe closes it. An `offline` event or an error closes the source
 * with no reconnect, as the console's client does, and a later first
 * listener opens a new one.
 */
export class BridgeTelemetry implements IStationTelemetry {
  static deps = [BRIDGE_ENDPOINT] as const;

  readonly #listeners = new Set<() => void>();
  #state: TelemetryState = Object.freeze({
    status: 'connecting',
    reading: null,
  });
  #source: EventSource | undefined;
  // Each open and close moves it on, so an endpoint answer that arrives
  // after a close opens nothing.
  #generation = 0;

  constructor(private readonly endpoint: IBridgeEndpoint) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    // One entry per call, so a listener that subscribes twice counts twice.
    const entry = () => listener();
    this.#listeners.add(entry);
    if (this.#listeners.size === 1) this.#open();
    return () => {
      if (this.#listeners.delete(entry) && this.#listeners.size === 0)
        this.#close();
    };
  };

  readonly state = (): TelemetryState => this.#state;

  /** The container calls it when it disposes: the listeners go and the source closes. */
  [Symbol.dispose](): void {
    this.#listeners.clear();
    this.#close();
  }

  #open(): void {
    const generation = ++this.#generation;
    this.#set({ status: 'connecting', reading: null });
    this.endpoint.url().then(
      (url) => {
        if (generation !== this.#generation) return;
        const source = new EventSource(new URL('telemetry', url));
        this.#source = source;
        source.addEventListener('snapshot', (event) =>
          this.#set({
            status: 'online',
            reading: JSON.parse(event.data) as TelemetryReading,
          }),
        );
        source.addEventListener('offline', () => this.#offline());
        source.addEventListener('error', () => this.#offline());
      },
      () => {
        if (generation === this.#generation) this.#offline();
      },
    );
  }

  #close(): void {
    this.#generation += 1;
    this.#source?.close();
    this.#source = undefined;
  }

  #offline(): void {
    this.#close();
    this.#set(OFFLINE);
  }

  /** Replaces the state when it differs and tells every listener. */
  #set(next: TelemetryState): void {
    if (
      next.status === this.#state.status &&
      next.reading === this.#state.reading
    )
      return;
    this.#state = Object.freeze(next);
    for (const listener of [...this.#listeners]) listener();
  }
}
