import { Token } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
// Type imports: the console holds no simulation code.
import type {
  AtmosphereReading,
  CompartmentId,
  FtlRating,
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
 * The reply when the link cannot reach bridge-api: a refusal with status 503
 * whose message names the address and whose fix names the dev target.
 */
export interface BridgeOffline {
  readonly accepted: false;
  readonly status: 503;
  readonly code: 'BRIDGE_OFFLINE';
  readonly message: string;
  readonly fix: string;
}

/**
 * What bridge-api answers a command: the tick that applies it and, when the
 * request's flight log holds entries, those entries, or its refusal. A
 * bridge-api the link cannot reach answers `BridgeOffline`.
 */
export type CommandAnswer =
  | {
      readonly accepted: true;
      readonly tick: number;
      readonly flightLog?: readonly string[];
      /** A note from the system on its own outcome, such as a hail with no link. */
      readonly notice?: {
        readonly code: string;
        readonly message: string;
        readonly fix?: string;
      };
    }
  | {
      readonly accepted: false;
      readonly status: 400 | 409;
      readonly code: string;
      readonly message: string;
      readonly fix?: string;
    }
  | BridgeOffline;

/** The refusal bridge-api answers `GET /course/:to` with for an uncharted star. */
export interface CourseRefusal {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

/** What the link gives for a course: the plot with its flight log, or a refusal. */
export type CourseAnswer =
  | { readonly course: Course; readonly entries: readonly string[] }
  | CourseRefusal;

/** The console's link to bridge-api, over HTTP. */
export interface IBridgeLink {
  /** The course and the request's flight log, or the refusal for an uncharted star. */
  course(to: string): Promise<CourseAnswer>;
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
  /**
   * Posts `cmd` to `POST /commands`. Any status but 202, 400 and 409 rejects.
   * A network error answers `BridgeOffline`.
   */
  command(cmd: ShipCommand): Promise<CommandAnswer>;
  /**
   * Posts to `POST /sections/ftl`, which loads the FTL drive, and gives the
   * drive's rating. From then on `command` reaches the `ftl` system. Any
   * status but 200 rejects. A network error answers `BridgeOffline`.
   */
  loadFtl(): Promise<FtlRating | BridgeOffline>;
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
