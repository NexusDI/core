import { Token } from '@nexusdi/core';

export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

export interface INavCharts {
  heading(to: string): number;
}
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
