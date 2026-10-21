import { Nexus } from '@nexusdi/core';

import type { SimMode } from './ship/contracts';
import { meridian, offlineMeridian, type ShipSetup } from './ship/meridian';
import { bridgePlugins } from './ship/plugins';

const MODES: readonly SimMode[] = ['live', 'manual'];
const MAX_SEED = 2 ** 32 - 1;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The ship setup the Node servers start: SIM_MODE, `live` or `manual`, and
 * SIM_SEED, a whole number from 0 to 4294967295. Unset, they give a live ship
 * on seed 7, and so do empty ones. A tick is always 0.5 ship seconds.
 */
export function setupFromEnv(env: Env = process.env): ShipSetup {
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

/** True unless NODE_ENV is `production`. */
export const isDev = (env: Env): boolean => env.NODE_ENV !== 'production';

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
    plugins: bridgePlugins({ dev: isDev(process.env) }),
  });
}

/**
 * On SIGTERM, calls `close` to stop the server taking connections, then
 * disposes the ship. The server waits for its open connections before it
 * closes, and the ship's telemetry feed ends every open `GET /telemetry`
 * stream when it disposes, so the server can close. A second dispose, such
 * as an entry's `await using`, returns the first one's promise. An error
 * from either step goes to the console and sets exit code 1.
 */
export function stopOnSigterm(
  close: () => unknown,
  ship: AsyncDisposable,
  signals: { once(event: 'SIGTERM', listener: () => void): unknown } = process,
): void {
  signals.once('SIGTERM', async () => {
    const steps = await Promise.allSettled([
      (async () => close())(),
      ship[Symbol.asyncDispose](),
    ]);
    const errors = new Set(
      steps.flatMap((step) =>
        step.status === 'rejected' ? [step.reason] : [],
      ),
    );
    for (const error of errors) console.error(error);
    if (errors.size > 0) process.exitCode = 1;
  });
}

/** The port the Node servers listen on: PORT, or 3000. */
export const port = (): number => Number(process.env.PORT ?? 3000);

/** Prints the line a Node server prints once it listens on `port`. */
export const listening = (port: number): void =>
  console.log(`Server is running on http://localhost:${port}`);
