import { Nexus } from '@nexusdi/core';
import * as tools from '@nexusdi/devtools';

import { honoMissionRoutes } from '../../e2e/fixtures/mission-routes';
import { createBridge } from '../../src/entries/hono';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';

// The offline worker of src/entries/worker.offline.ts for Vercel's Edge Runtime: the
// same graph and plugins, built once per isolate, with no nodeScopes(), since
// the VM has no node:async_hooks. A door command answers the tick alone. The
// counters let the test read what happened inside the VM.
interface FetchEvent extends Event {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
}

const counts = { create: 0, dispose: 0, waitUntil: 0 };
(globalThis as { bridgeCounts?: typeof counts }).bridgeCounts = counts;

const ready = Nexus.create(OfflineMeridian, {
  plugins: bridgePlugins({
    tools,
    trace: (event) => {
      if (event.type === 'scope:create') counts.create += 1;
      if (event.type === 'scope:dispose') counts.dispose += 1;
    },
  }),
}).then((ship) => createBridge(ship, { mount: honoMissionRoutes() }));

addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEvent;
  const waitUntil = fetchEvent.waitUntil.bind(fetchEvent);
  // Hono reads waitUntil from the execution context it is handed.
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      counts.waitUntil += 1;
      waitUntil(promise);
    },
    passThroughOnException() {},
    props: {},
  };
  fetchEvent.respondWith(
    ready.then((app) => app.fetch(fetchEvent.request, {}, ctx)),
  );
});
