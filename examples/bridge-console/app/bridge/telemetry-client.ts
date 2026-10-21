import { defineModule, provide, Token } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';

/** The browser's view of the ship's telemetry stream. */
export interface ITelemetryClient {
  /**
   * Calls `next` with each ship reading the stream sends, and `offline` once
   * when the stream ends or fails. The returned function closes the stream.
   */
  subscribe(
    next: (ship: ShipReading) => void,
    offline: (reason: string) => void,
  ): () => void;
}
export const TELEMETRY_CLIENT = new Token<ITelemetryClient>('TelemetryClient');

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
