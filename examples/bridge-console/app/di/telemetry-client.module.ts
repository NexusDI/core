import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

import { TELEMETRY_CLIENT, type ITelemetryClient } from './contracts';

type Subscriber = {
  next: (ship: ShipReading) => void;
  offline: (reason: string) => void;
};

/**
 * Reads the console's `/telemetry` route through one EventSource that every
 * subscriber shares. The first `subscribe` opens it, so SSR can build the
 * class, and the last unsubscribe closes it. An `offline` event or an error
 * with no reconnect closes it, calls `offline` on every subscriber and clears
 * the set. A `subscribe` after that opens a new source.
 */
class EventSourceTelemetry implements ITelemetryClient {
  #source: EventSource | undefined;
  #subscribers = new Set<Subscriber>();

  subscribe(
    next: (ship: ShipReading) => void,
    offline: (reason: string) => void,
  ) {
    const subscriber: Subscriber = { next, offline };
    this.#subscribers.add(subscriber);
    this.#source ??= this.#open();
    return () => {
      if (!this.#subscribers.delete(subscriber)) return;
      if (this.#subscribers.size === 0) this.#close();
    };
  }

  #open() {
    const source = new EventSource('/telemetry');
    source.addEventListener('snapshot', (event) => {
      const ship = JSON.parse(event.data) as ShipReading;
      for (const subscriber of [...this.#subscribers]) subscriber.next(ship);
    });
    source.addEventListener('offline', (event) => this.#lost(event.data));
    source.addEventListener('error', () => this.#lost('telemetry lost'));
    return source;
  }

  #close() {
    this.#source?.close();
    this.#source = undefined;
  }

  #lost(reason: string) {
    const subscribers = [...this.#subscribers];
    this.#subscribers.clear();
    this.#close();
    for (const subscriber of subscribers) subscriber.offline(reason);
  }
}

/**
 * TELEMETRY_CLIENT, which both the server graph and the client graph import.
 */
export const TelemetryClient = defineModule({
  name: 'TelemetryClient',
  providers: [provide(TELEMETRY_CLIENT, { useClass: EventSourceTelemetry })],
  exports: [TELEMETRY_CLIENT],
});
