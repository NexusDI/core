import { GROWTH, REMOTES } from './ports.ts';

/** The shell's e2e build, which three shell instances serve. */
export const SHELL_DIST = 'federation-shell/dist/e2e';

/** The four remote builds the shell loads, each on its own port. */
export const REMOTE_DISTS = [
  { dist: 'federation-cartography/dist/main', port: REMOTES.cartography },
  { dist: 'federation-command/dist/main', port: REMOTES.command },
  { dist: 'federation-cartography/dist/drift', port: REMOTES.drift },
  { dist: 'federation-cartography/dist/unshared', port: REMOTES.unshared },
] as const;

/**
 * The two station builds. The gating suite serves neither one and checks
 * both for simulation code; the growth suite serves them.
 */
const STATION_DISTS = [
  'federation-engineering/dist/main',
  'federation-life-support/dist/main',
] as const;

/**
 * The three remote builds the growth suite's shell loads, each on its
 * growth port. The e2e-growth target builds them first (project.json).
 */
export const GROWTH_DISTS = [
  { dist: 'federation-command/dist/main', port: GROWTH.command },
  { dist: 'federation-engineering/dist/main', port: GROWTH.engineering },
  { dist: 'federation-life-support/dist/main', port: GROWTH.lifeSupport },
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
