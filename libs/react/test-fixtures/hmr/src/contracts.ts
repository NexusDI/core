import { Token } from '@nexusdi/core';

export interface IFlightLog {
  label(): string;
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

export interface INavCharts {
  heading(): number;
}
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
