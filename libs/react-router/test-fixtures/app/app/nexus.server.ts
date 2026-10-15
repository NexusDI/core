import {
  errorBase,
  Nexus,
  NEXUS_PLUGIN_API,
  type NexusPlugin,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';
import { nexus, type NexusRouterOptions } from '@nexusdi/react-router';
import type { MiddlewareFunction } from 'react-router';

import { Meridian } from './ship';

// The test reads the trace through this global key. The marker string is in
// the server build; the client-bundle check asserts it never reaches
// build/client.
export const FIXTURE_MARKER = 'nexus-server-fixture-marker';
const store = globalThis as { ['react-router-fixture.events']?: TraceEvent[] };
const events = (store['react-router-fixture.events'] ??= []);
const plugins = [trace((event) => events.push(event))];

const StardockOffline = errorBase<'ACME_STARDOCK_OFFLINE', { dock: string }>(
  'ACME_STARDOCK_OFFLINE',
  'StardockOfflineError',
);
/** A third-party plugin whose construct hook fails every scoped build. */
const stardock: NexusPlugin = {
  name: 'acme:stardock',
  apiVersion: NEXUS_PLUGIN_API,
  construct: (_instance, _provider, scope) => {
    if (scope !== null) throw new StardockOffline({ dock: '7' });
    return undefined;
  },
};

const options: NexusRouterOptions = {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
};

const ship = await Nexus.create(Meridian, { plugins });
const gone = await Nexus.create(Meridian, { plugins });
await gone[Symbol.asyncDispose]();

/** The app's adapter: a live container, lazy request scopes. */
export const di = nexus(ship, options);
/** The same container with an ambient scope, under /ambient. */
export const scopes = nodeScopes();
export const ambient = nexus(await Nexus.create(Meridian, { plugins }), {
  ...options,
  scopes,
});
/** The function form, validated on the first request, under /lazy. */
export const lazy = nexus(() => Nexus.create(Meridian, { plugins }), options);
/**
 * A disposed container, under /gone. The function form, because a live
 * container's inject validates when the route module loads, which a
 * disposed one refuses.
 */
export const disposed = nexus(() => Promise.resolve(gone), options);
/** A container whose construct hook throws a third-party code, under /acme. */
export const acme = nexus(
  await Nexus.create(Meridian, { plugins: [...plugins, stardock] }),
  options,
);

const byPrefix: [string, MiddlewareFunction<Response>][] = [
  ['/ambient/', ambient.middleware],
  ['/lazy/', lazy.middleware],
  ['/gone', disposed.middleware],
  ['/acme', acme.middleware],
];

/** The root middleware: each path prefix runs its own adapter. */
export const middleware: MiddlewareFunction<Response> = (args, next) => {
  const path = new URL(args.request.url).pathname;
  const chosen =
    byPrefix.find(([prefix]) => path.startsWith(prefix))?.[1] ?? di.middleware;
  return chosen(args, next);
};
