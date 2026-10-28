import { GROWTH, REMOTES } from './ports.ts';
import type { StationRow } from '../src/stations.ts';

/** The build folder of a station's remote, as a path under examples/. */
const distOf = (id: StationRow['id'], out = 'main') =>
  `federation-${id}/dist/${out}`;

/** The shell's e2e build, which three shell instances serve. */
export const SHELL_DIST = 'federation-shell/dist/e2e';

/** The four remote builds the shell loads, each on its own port. */
export const REMOTE_DISTS = [
  { dist: distOf('cartography'), port: REMOTES.cartography },
  { dist: distOf('command'), port: REMOTES.command },
  { dist: distOf('cartography', 'drift'), port: REMOTES.drift },
  { dist: distOf('cartography', 'unshared'), port: REMOTES.unshared },
] as const;

/**
 * The two station builds. The gating suite serves neither one and checks
 * both for simulation code; the growth suite serves them.
 */
const STATION_DISTS = [distOf('engineering'), distOf('life-support')] as const;

/**
 * The three remote builds the growth suite's shell loads, each on its
 * growth port. The e2e-growth target builds them first (project.json).
 */
export const GROWTH_DISTS = [
  { dist: distOf('command'), port: GROWTH.command },
  { dist: distOf('engineering'), port: GROWTH.engineering },
  { dist: distOf('life-support'), port: GROWTH.lifeSupport },
] as const;

/**
 * Every build the e2e target builds first (project.json), as a path under
 * examples/.
 */
export const DISTS = [
  SHELL_DIST,
  ...REMOTE_DISTS.map(({ dist }) => dist),
  ...STATION_DISTS,
];
