import { Token } from '@nexusdi/core';
import type { Course, INavCharts } from '@nexusdi/bridge-api/contracts';

export type { Course, INavCharts };

/** The console's own record of a request, beside the backend's flight log. */
export interface IWatchLog {
  record(entry: string): void;
  entries(): readonly string[];
}

/** The console's token for the star charts, typed by bridge-api's contract. */
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
export const WATCH_LOG = new Token<IWatchLog>('WatchLog');
