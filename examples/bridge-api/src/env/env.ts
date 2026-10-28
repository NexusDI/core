import type { SimMode } from '../ship/contracts';
import type { ShipSetup } from '../ship/meridian.module';

const MODES: readonly SimMode[] = ['live', 'manual'];
const MAX_SEED = 2 ** 32 - 1;

/** The environment the Node servers read: `process.env`, or a record in a test. */
export type Env = Readonly<Record<string, string | undefined>>;

const isMode = (value: string): value is SimMode =>
  MODES.some((mode) => mode === value);

/**
 * The ship setup the Node servers start: SIM_MODE, `live` or `manual`, and
 * SIM_SEED, a whole number from 0 to 4294967295. Unset, they give a live ship
 * on seed 7, and so do empty ones. A tick is always 0.5 ship seconds.
 */
export function setupFromEnv(env: Env = process.env): ShipSetup {
  const mode = env.SIM_MODE || 'live';
  if (!isMode(mode)) {
    throw new Error(
      `SIM_MODE is '${mode}'. Set it to 'live' or 'manual', or leave it unset for 'live'.`,
    );
  }
  const raw = env.SIM_SEED || '7';
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_SEED) {
    throw new Error(
      `SIM_SEED is '${raw}'. Set it to a whole number from 0 to ${MAX_SEED}, or leave it unset for 7.`,
    );
  }
  return { sim: { seed: Number(raw), dt: 0.5 }, mode };
}

/** True unless NODE_ENV is `production`. */
export const isDev = (env: Env = process.env): boolean =>
  env.NODE_ENV !== 'production';

/** The port the Node servers listen on: PORT, or 3000. */
export const port = (env: Env = process.env): number =>
  Number(env.PORT ?? 3000);

/** Prints the line a Node server prints once it listens on `port`. */
export const listening = (port: number): void =>
  console.log(`Server is running on http://localhost:${port}`);
