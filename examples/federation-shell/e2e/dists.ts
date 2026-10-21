import { REMOTES } from './ports.ts';

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
 * Every build the e2e target builds first (project.json), as a path under
 * examples/.
 */
export const DISTS = [SHELL_DIST, ...REMOTE_DISTS.map(({ dist }) => dist)];
