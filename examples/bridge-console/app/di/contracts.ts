import { Token } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
// Type imports: the console holds no simulation code.
import type {
  AtmosphereReading,
  CompartmentId,
  ShipCommand,
  ShipReading,
} from '@nexusdi/meridian-systems';
import type { Course } from '@nexusdi/meridian-systems/charts';

/** The console's own record of a request, beside the backend's flight log. */
export interface IWatchLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export const WATCH_LOG = new Token<IWatchLog>('WatchLog');

/**
 * What bridge-api answers a command: the tick that applies it and, when the
 * request's flight log holds entries, those entries, or its refusal.
 */
export type CommandAnswer =
  | {
      readonly accepted: true;
      readonly tick: number;
      readonly flightLog?: readonly string[];
    }
  | {
      readonly accepted: false;
      readonly status: 400 | 409;
      readonly code: string;
      readonly message: string;
      readonly fix?: string;
    };

/** The console's link to bridge-api, over HTTP. */
export interface IBridgeLink {
  course(to: string): Promise<{ course: Course; entries: readonly string[] }>;
  /** The ship now, with each compartment's pressure, from `GET /sim`. */
  snapshot(): Promise<ShipReading>;
  /**
   * The gas analyzer's reading of `compartment`, from
   * `GET /compartments/:id/atmosphere`. A compartment the deck lacks answers
   * 404, and the call rejects.
   */
  atmosphere(compartment: string): Promise<AtmosphereReading<CompartmentId>>;
  /** The body of `GET /telemetry`, a stream of server-sent events. */
  telemetry(): Promise<ReadableStream<Uint8Array>>;
  /**
   * The ship's annotated graph from `GET /graph`, or null when the backend
   * serves none.
   */
  graph(): Promise<NexusGraph | null>;
  /** Posts `cmd` to `POST /commands`. Any status but 202, 400 and 409 rejects. */
  command(cmd: ShipCommand): Promise<CommandAnswer>;
  /**
   * Posts the spool to `POST /ftl/spool`. The backend loads the FTL drive on
   * the first spool or jump.
   */
  spool(): Promise<CommandAnswer>;
  /** Posts a jump to the charted star `to`, to `POST /ftl/jump`. */
  jump(to: string): Promise<CommandAnswer>;
}
export const BRIDGE_LINK = new Token<IBridgeLink>('BridgeLink');

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
