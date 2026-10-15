import { Token } from '@nexusdi/core';

export interface Mission {
  readonly id: string;
  readonly target: string;
}
export interface Course {
  readonly to: string;
  readonly heading: number;
}
export interface INavCharts {
  plot(to: string): Course;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export interface ISubspaceLink {
  receive<T>(channel: string): Promise<T>;
}
export interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay';
  readonly relayUrl: string;
}

export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
export const MISSION = new Token<Mission>('Mission');
export const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
export const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
