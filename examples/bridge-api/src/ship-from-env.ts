import { Nexus } from '@nexusdi/core';

import type { SimMode } from './ship/contracts';
import { meridian, offlineMeridian, type ShipSetup } from './ship/meridian';
import { bridgePlugins } from './ship/plugins';

const MODES: readonly SimMode[] = ['live', 'manual'];
const MAX_SEED = 2 ** 32 - 1;

/**
 * The ship setup the Node servers start: SIM_MODE, `live` or `manual`, and
 * SIM_SEED, a whole number from 0 to 4294967295. Unset, they give a live ship
 * on seed 7, and so do empty ones. A tick is always 0.5 ship seconds.
 */
export function setupFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ShipSetup {
  const mode = env.SIM_MODE || 'live';
  if (!MODES.includes(mode as SimMode)) {
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
  return { sim: { seed: Number(raw), dt: 0.5 }, mode: mode as SimMode };
}

/**
 * The container the Node servers start: the relay graph when RELAY_URL is
 * set, the offline graph otherwise, with errors() and devtools() outside
 * production.
 */
export function shipFromEnv(): Promise<Nexus> {
  const setup = setupFromEnv();
  const root = process.env.RELAY_URL
    ? meridian(process.env.RELAY_URL, setup)
    : offlineMeridian(setup);
  return Nexus.create(root, {
    plugins: bridgePlugins({ dev: process.env.NODE_ENV !== 'production' }),
  });
}

/** The port the Node servers listen on: PORT, or 3000. */
export const port = (): number => Number(process.env.PORT ?? 3000);

/** Prints the line a Node server prints once it listens on `port`. */
export const listening = (port: number): void =>
  console.log(`Server is running on http://localhost:${port}`);
