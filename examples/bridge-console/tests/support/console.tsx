/**
 * The console's route spec idiom: one `nexusTest` fixture over the server
 * graph, a request scope per call and `renderRoute`, which renders a route
 * module the way React Router runs it. The mocked `nexus.server` checks the
 * routes' deps against the same container, so a spec builds one.
 */
import { render } from '@testing-library/react';
import type { Nexus, Scope } from '@nexusdi/core';
import { NAV_CHARTS, type INavCharts } from '@nexusdi/meridian-systems/charts';
import { NexusProvider } from '@nexusdi/react';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import {
  createTestingContainer,
  type TestingContainerBuilder,
} from '@nexusdi/testing';
import { nexusTest, type NexusSetupStep } from '@nexusdi/vitest';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import { test as base } from 'vitest';

import { BridgeClient } from '../../app/di/bridge.client';
import { BridgeConsole } from '../../app/di/bridge.server';
import { BRIDGE_LINK } from '../../app/di/contracts';
import { FakeBridgeLink, fakeBridgeLink } from '../doubles';
import { serve } from './nexus-server';

type StubRoute = Parameters<typeof createRoutesStub>[0][number];

/** The parts of a route module a spec renders. */
export interface RouteModule {
  readonly default: StubRoute['Component'];
  readonly loader?: StubRoute['loader'];
  readonly action?: StubRoute['action'];
  readonly ErrorBoundary?: StubRoute['ErrorBoundary'];
}

/** What a spec chooses about the request scope. */
export interface ScopeOptions {
  /** The mission id of the request. Defaults to `survey-7`. */
  readonly mission?: string;
  /** Changes the server container for this scope, such as another BRIDGE_LINK. */
  readonly overrides?: NexusSetupStep;
}

/** What a spec chooses about the rendered route. */
export interface RenderOptions extends ScopeOptions {
  /** The route's path pattern, such as `/course/:to`. */
  readonly path: string;
  /** The location to render. Defaults to `path`. */
  readonly at?: string;
  /** Changes the client container the page renders under. */
  readonly browser?: NexusSetupStep;
}

/** The fixtures `renderRoute` and `openScope` add to `nexusTest`. */
interface ConsoleFixtures {
  /** A request scope of the server container, disposed with the test. */
  openScope(options?: ScopeOptions): Promise<Scope>;
  /** Renders `route` with its loader and action in a request scope. */
  renderRoute(
    route: RouteModule,
    options: RenderOptions,
  ): Promise<{ scope: Scope; browser: Nexus }>;
}

/** The `renderRoute` fixture's function, for the page helper a test file writes. */
export type RenderRoute = ConsoleFixtures['renderRoute'];

/** The server graph with the link double, which every spec starts from. */
const consoleSetup: NexusSetupStep = (builder) =>
  builder.override(BRIDGE_LINK, fakeBridgeLink);

/** The override that gives each request a BRIDGE_LINK of class `link`. */
export const withLink =
  (link: typeof FakeBridgeLink): NexusSetupStep =>
  (builder: TestingContainerBuilder) =>
    builder.override(BRIDGE_LINK, { useClass: link, lifetime: 'scoped' });

/** The override that gives a graph NAV_CHARTS of class `charts`. */
export const withCharts =
  (charts: new () => INavCharts): NexusSetupStep =>
  (builder: TestingContainerBuilder) =>
    builder.override(NAV_CHARTS, { useClass: charts });

/** The router context of a request that `scope` serves. */
export const contextOf = (scope: Scope) =>
  new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]]));

/** The arguments React Router passes a loader for `path`, served by `scope`. */
export const loaderArgs = (
  scope: Scope,
  path: string,
  params: Record<string, string> = {},
) =>
  ({
    params,
    context: contextOf(scope),
    request: new Request(`http://bridge${path}`),
  }) as never;

function Loading() {
  return <p>Loading the page</p>;
}

export const test = nexusTest(base, BridgeConsole, {
  setup: consoleSetup,
  // Every test in the file shares one container, for the routes' deps checks
  // and the default scopes. nexus() in nexus-server.ts memoises the first container its
  // function source returns (libs/react-router/src/internal/request-scope.ts
  // line 107-119), so a per-test container would leave the checks bound to
  // the first test's disposed one. A call with `overrides` builds its own
  // container for its scope, because the fixture's setup is fixed per file.
  containerScope: 'file',
}).extend<ConsoleFixtures>({
  openScope: async ({ nexus }, provide) => {
    serve(nexus);
    const opened: AsyncDisposable[] = [];
    await provide(async ({ mission = 'survey-7', overrides } = {}) => {
      let ship = nexus;
      if (overrides !== undefined) {
        ship = await overrides(
          consoleSetup(createTestingContainer(BridgeConsole)),
        ).create();
        opened.push(ship);
      }
      const scope = await ship.createScope({
        request: { mission: { id: mission, target: 'Kepler-442b' } },
      });
      opened.push(scope);
      return scope;
    });
    for (const item of opened.reverse()) await item[Symbol.asyncDispose]();
  },
  renderRoute: async ({ openScope }, provide) => {
    const browsers: Nexus[] = [];
    await provide(
      async (route, { path, at = path, browser, ...scopeOptions }) => {
        const scope = await openScope(scopeOptions);
        const builder = createTestingContainer(BridgeClient);
        const client = await (browser?.(builder) ?? builder).create();
        browsers.push(client);
        const Stub = createRoutesStub(
          [
            {
              path,
              Component: route.default,
              loader: route.loader,
              action: route.action,
              ErrorBoundary: route.ErrorBoundary,
              HydrateFallback: Loading,
            },
          ],
          contextOf(scope),
        );
        render(
          <NexusProvider container={client}>
            <Stub initialEntries={[at]} />
          </NexusProvider>,
        );
        return { scope, browser: client };
      },
    );
    await Promise.all(browsers.map((ship) => ship[Symbol.asyncDispose]()));
  },
});
