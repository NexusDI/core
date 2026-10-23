/**
 * The ports of demo apps spec 7.1. The remote lists in e2e/remotes name the
 * remote ports. SHELL_PORT moves the three shell instances on a machine
 * where 4300 is taken; CI uses the spec's ports.
 */
const shell = Number(process.env['SHELL_PORT'] ?? 4300);

export const SHELLS = {
  main: shell,
  drift: shell + 10,
  unshared: shell + 20,
} as const;

export const REMOTES = {
  cartography: 4301,
  command: 4302,
  drift: 4303,
  unshared: 4304,
} as const;

/**
 * The growth suite's ports (playwright.e2e-growth.config.mts): its shell 30
 * above the main shell, bridge-api on 4331, and each station remote it
 * loads on its dev port plus 30. The growth.json remote list names the
 * remote ports.
 */
export const GROWTH = {
  shell: shell + 30,
  api: 4331,
  command: 4332,
  engineering: 4335,
  lifeSupport: 4336,
} as const;
