import { type Scope, Token } from '@nexusdi/core';
import type { ShipSnapshot } from '@nexusdi/meridian-systems';

// meridian-systems defines the charts and the link. The bridge re-exports
// them, so every importer of ./contracts keeps its names.
export {
  COMMS_OPTIONS,
  type CommsOptions,
  type Course,
  type INavCharts,
  type ISubspaceLink,
  NAV_CHARTS,
  SUBSPACE_LINK,
} from '@nexusdi/meridian-systems';

export interface Mission {
  readonly id: string;
  readonly target: string;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}

/** The scope of the request in flight, such as the one `nodeScopes()` runs. */
export interface IScopeSource {
  current(): Scope | undefined;
}

/** `live` advances the ship on a wall clock timer, `manual` only when asked. */
export type SimMode = 'live' | 'manual';
export interface DriverOptions {
  readonly mode: SimMode;
}
export interface ISimDriver {
  readonly mode: SimMode;
  /** Runs `ticks` ticks now and returns the ship after the last. */
  advance(ticks: number): ShipSnapshot;
}

/** The event names `GET /telemetry` sends: a frame per tick, then `offline`. */
export type TelemetryEvent = 'snapshot' | 'offline';

export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
export const MISSION = new Token<Mission>('Mission');
export const DRIVER_OPTIONS = new Token<DriverOptions>('DriverOptions');
export const SIM_DRIVER = new Token<ISimDriver>('SimDriver');
export const REQUEST_SCOPES = new Token<IScopeSource>('RequestScopes');
