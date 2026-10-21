import { Token } from '@nexusdi/core';
import type { ShipReading } from '../simulation/contracts';

/** One reader of the feed, such as an open `GET /telemetry` stream. */
export interface TelemetrySink {
  /** Takes the ship reading `readShip` builds for one tick. */
  next(frame: ShipReading): void;
  /** The feed sends no frame after this call. */
  close(reason: string): void;
}

export interface ITelemetryFeed {
  /**
   * Sends `sink` the reading of the current snapshot at once, then one per
   * tick. The returned function unsubscribes the sink, runs twice safely and
   * never calls `close`.
   */
  subscribe(sink: TelemetrySink): () => void;
}

export const TELEMETRY = new Token<ITelemetryFeed>('TelemetryFeed');
