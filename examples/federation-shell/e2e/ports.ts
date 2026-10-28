import { stationById, type StationRow } from '../src/stations.ts';

/** The port of the row `id` in the station table. */
const portOf = (id: StationRow['id']): number => stationById(id).port;

/**
 * How far each build's port sits above its row's development port: the drift
 * and unshared builds of cartography, and the growth suite's remotes.
 */
export const OFFSET = { drift: 2, unshared: 3, growth: 30 } as const;

/**
 * The ports of the shell and the remotes. The remote lists in e2e/remotes.ts name
 * the remote ports. SHELL_PORT moves the three shell instances on a machine
 * where 4300 is taken; CI keeps the defaults.
 */
const shell = Number(process.env['SHELL_PORT'] ?? 4300);

export const SHELLS = {
  main: shell,
  drift: shell + 10,
  unshared: shell + 20,
} as const;

export const REMOTES = {
  cartography: portOf('cartography'),
  command: portOf('command'),
  drift: portOf('cartography') + OFFSET.drift,
  unshared: portOf('cartography') + OFFSET.unshared,
} as const;

/**
 * The growth suite's ports (playwright.e2e-growth.config.mts): its shell 30
 * above the main shell, bridge-api on 4331, and each station remote it
 * loads on its row's port plus 30.
 */
export const GROWTH = {
  shell: shell + 30,
  api: 4331,
  command: portOf('command') + OFFSET.growth,
  engineering: portOf('engineering') + OFFSET.growth,
  lifeSupport: portOf('life-support') + OFFSET.growth,
} as const;
