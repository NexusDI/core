import { defineContract } from '@nexusdi/federation';
// The package's own subpath, so a bundler can alias the version alone: the
// drift build of federation-cartography maps it to the next minor.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MERIDIAN_CONTRACT_VERSION } from '@nexusdi/federation-contracts/version';

import type { ICommandLink } from './command-link.js';
import type { INavCharts } from './nav-charts.js';
import type { IStationTelemetry } from './station-telemetry.js';

export type {
  CommandReceipt,
  ICommandLink,
  StationCommand,
} from './command-link.js';
export type { Course, INavCharts } from './nav-charts.js';
export type {
  CompartmentTelemetry,
  IStationTelemetry,
  TelemetryReading,
  TelemetryState,
} from './station-telemetry.js';
export { MERIDIAN_CONTRACT_VERSION };

/** The contract between the shell and its remotes. The shell owns it. */
export const meridian = defineContract({
  key: 'meridian',
  version: MERIDIAN_CONTRACT_VERSION,
});

/** The star charts, described `meridian/NavCharts` in every copy. */
export const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');
/** The ship's telemetry, described `meridian/StationTelemetry` in every copy. */
export const TELEMETRY_FEED =
  meridian.token<IStationTelemetry>('StationTelemetry');
/** The crew command link, described `meridian/CommandLink` in every copy. */
export const COMMAND_LINK = meridian.token<ICommandLink>('CommandLink');
