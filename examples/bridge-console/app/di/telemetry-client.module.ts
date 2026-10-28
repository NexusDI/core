import { defineModule, provide } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

import { TELEMETRY_CLIENT, type ITelemetryClient } from './contracts';

/**
 * Reads the console's `/telemetry` route through an EventSource. Only
 * `subscribe` opens the source, so SSR can build the class, and it closes the
 * source on an `offline` event or an error with no reconnect.
 */
class EventSourceTelemetry implements ITelemetryClient {
  subscribe(
    next: (ship: ShipReading) => void,
    offline: (reason: string) => void,
  ) {
    const source = new EventSource('/telemetry');
    source.addEventListener('snapshot', (event) =>
      next(JSON.parse(event.data) as ShipReading),
    );
    source.addEventListener('offline', (event) => {
      source.close();
      offline(event.data);
    });
    source.addEventListener('error', () => {
      source.close();
      offline('telemetry lost');
    });
    return () => source.close();
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
