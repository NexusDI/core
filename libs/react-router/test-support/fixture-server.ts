import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { TraceEvent } from '@nexusdi/core';
import { createRequestListener } from '@react-router/node';

export const FIXTURE = join(import.meta.dirname, '..', 'test-fixtures', 'app');

/**
 * Builds the fixture app once per run; vite.config.ts names this file as
 * globalSetup. The fixture's folder is passed to the CLI, because npx runs
 * in the folder of the nearest package.json, which is libs/react-router.
 */
export function setup(): void {
  execFileSync('npx', ['react-router', 'build', FIXTURE], {
    cwd: FIXTURE,
    stdio: 'inherit',
  });
}

/** Serves the built fixture app on port 0 through @react-router/node. */
export async function startFixture() {
  const build = await import(
    pathToFileURL(join(FIXTURE, 'build', 'server', 'index.js')).href
  );
  const server = createServer(createRequestListener({ build }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const store = globalThis as {
    ['react-router-fixture.events']?: TraceEvent[];
  };
  const events = (store['react-router-fixture.events'] ??= []);
  return {
    url: `http://127.0.0.1:${port}`,
    events,
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
