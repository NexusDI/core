import { Nexus } from '@nexusdi/core';

import { meridian, OfflineMeridian } from './ship/meridian';
import { bridgePlugins } from './ship/plugins';

/**
 * The container the Node servers start: the relay graph when RELAY_URL is
 * set, the offline graph otherwise, with errors() and devtools() outside
 * production.
 */
export function shipFromEnv(): Promise<Nexus> {
  const root = process.env.RELAY_URL
    ? meridian(process.env.RELAY_URL)
    : OfflineMeridian;
  return Nexus.create(root, {
    plugins: bridgePlugins({ dev: process.env.NODE_ENV !== 'production' }),
  });
}

/** The port the Node servers listen on: PORT, or 3000. */
export const port = (): number => Number(process.env.PORT ?? 3000);

/** Prints the line a Node server prints once it listens on `port`. */
export const listening = (port: number): void =>
  console.log(`Server is running on http://localhost:${port}`);
