import { Token } from '@nexusdi/core';
import type { ShipSnapshot } from '../simulation/contracts';

/** One reader of the feed, such as an open `GET /telemetry` stream. */
export interface TelemetrySink {
  /** Takes a snapshot rounded by `roundSnapshot`. */
  next(frame: ShipSnapshot): void;
  /** The feed sends no frame after this call. */
  close(reason: string): void;
}

export interface ITelemetryFeed {
  /**
   * Sends `sink` the current snapshot at once, then one per tick. The
   * returned function unsubscribes the sink, runs twice safely and never
   * calls `close`.
   */
  subscribe(sink: TelemetrySink): () => void;
}

export const TELEMETRY = new Token<ITelemetryFeed>('TelemetryFeed');
