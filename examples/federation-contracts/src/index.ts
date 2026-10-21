import { defineContract } from '@nexusdi/federation';
// The package's own subpath, so a bundler can alias the version alone: the
// drift build of federation-cartography maps it to the next minor.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MERIDIAN_CONTRACT_VERSION } from '@nexusdi/federation-contracts/version';

import type { INavCharts } from './nav-charts.js';

export type { Course, INavCharts } from './nav-charts.js';
export { MERIDIAN_CONTRACT_VERSION };

/** The contract between the shell and its remotes. The shell owns it. */
export const meridian = defineContract({
  key: 'meridian',
  version: MERIDIAN_CONTRACT_VERSION,
});

/** The star charts, described `meridian/NavCharts` in every copy. */
export const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');
