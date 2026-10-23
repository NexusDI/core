import { Nexus } from '@nexusdi/core';

import type { IScopeSource, SimMode } from './ship/contracts';
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
 * The browser origins the Hono entry answers with CORS headers: SHELL_ORIGIN,
 * a comma-separated list, or the federation shell's dev server at
 * http://localhost:4300 and http://127.0.0.1:4300. Each entry is trimmed and
 * empty entries are dropped. Production answers none, whatever SHELL_ORIGIN
 * holds.
 */
export function shellOrigins(env: Env = process.env): readonly string[] {
  if (!isDev(env)) return [];
  const origins = (env.SHELL_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_SHELL_ORIGINS;
}

const DEFAULT_SHELL_ORIGINS: readonly string[] = [
  'http://localhost:4300',
  'http://127.0.0.1:4300',
];

/**
 * The container the Node servers start: the relay graph when RELAY_URL is
 * set, the offline graph otherwise, with errors() and devtools() outside
 * production. The flight recorder reads the request scope from `scopes`, the
 * same ones the entry hands the bridge.
 */
export function shipFromEnv(scopes?: IScopeSource): Promise<Nexus> {
  const setup = setupFromEnv();
  const root = process.env.RELAY_URL
    ? meridian(process.env.RELAY_URL, setup)
    : offlineMeridian(setup);
  return Nexus.create(root, {
    plugins: bridgePlugins({ dev: isDev(process.env), scopes }),
  });
}

/** The parts of a Node `http.Server` that `stopOnSigterm` uses. */
export interface StoppingServer {
  close(): unknown;
  closeIdleConnections(): void;
  closeAllConnections(): void;
  on(
    event: 'request',
    listener: (
      request: unknown,
      response: { once(event: 'finish', listener: () => void): unknown },
    ) => void,
  ): unknown;
}

/**
 * On SIGTERM, calls `close` (default `server.close()`) to stop the server
 * taking connections, then aborts `shutdown`, which ends every open
 * `GET /telemetry` stream with `ship offline`. The server waits for the
 * requests in flight, so each one answers with the ship still running. The
 * entry disposes the ship once the server has closed. `server.close()`
 * closes only the connections idle when it runs, so each response that
 * finishes after SIGTERM calls `server.closeIdleConnections()`. Without that
 * call, a keep-alive connection holds the server open until the client's or
 * the server's keep-alive timeout ends it (5 seconds on Node, 72 on
 * Fastify). After `drain` milliseconds (default 10 000),
 * `server.closeAllConnections()` ends the connections still open, such as
 * one that never sent a request (nodejs/node#63452). The timer keeps no
 * process alive. An entry calls this before its server takes a request. A
 * throw or a rejection from `close` goes to the console and sets exit code 1.
 */
export function stopOnSigterm(
  server: StoppingServer,
  shutdown: AbortController,
  {
    close = () => server.close(),
    drain = 10_000,
    signals = process,
  }: {
    close?: () => unknown;
    drain?: number;
    signals?: { once(event: 'SIGTERM', listener: () => void): unknown };
  } = {},
): void {
  server.on('request', (_, response) =>
    response.once('finish', () => {
      if (shutdown.signal.aborted) server.closeIdleConnections();
    }),
  );
  const report = (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  };
  signals.once('SIGTERM', () => {
    try {
      Promise.resolve(close()).catch(report);
    } catch (error) {
      report(error);
    }
    shutdown.abort();
    setTimeout(() => server.closeAllConnections(), drain).unref();
  });
}

/** The port the Node servers listen on: PORT, or 3000. */
export const port = (): number => Number(process.env.PORT ?? 3000);

/** Prints the line a Node server prints once it listens on `port`. */
export const listening = (port: number): void =>
  console.log(`Server is running on http://localhost:${port}`);
