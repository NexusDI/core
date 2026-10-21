import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import type { Nexus } from '@nexusdi/core';
import { NexusProvider } from '@nexusdi/react';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { nexusTest } from '@nexusdi/vitest';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { NAV_CHARTS, WATCH_LOG } from '../../app/bridge/contracts';
import { fakeBridgeLink } from '../doubles';
import { built, fakeCharts } from '../support/testing-di';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).homeServer(),
);

const { default: Home, loader, action } = await import('../../app/routes/home');

afterAll(() => Promise.all(built.map((ship) => ship[Symbol.asyncDispose]())));

/** Shown while the stub runs the loader, so React Router has a fallback to render. */
function HydrateFallback() {
  return <p>Docking</p>;
}

/** A fresh BridgeConsole testing container per test, with the fake charts and link. */
const test = nexusTest(base, BridgeConsole, {
  setup: (builder) =>
    builder
      .override(NAV_CHARTS, { useValue: fakeCharts })
      .override(BRIDGE_LINK, fakeBridgeLink),
  create: { onInit: false },
});

const scopeOf = (ship: Nexus, id: string) =>
  ship.createScope({ request: { mission: { id, target: 'Kepler-442b' } } });

describe('Home route', () => {
  test('renders the mission and a fresh watch log from the request scope', async ({
    nexus,
  }) => {
    const scope = await scopeOf(nexus, 'survey-7');
    const Stub = createRoutesStub(
      [{ path: '/', Component: Home, HydrateFallback, loader, action }],
      new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
    );
    // CoursePlotter reads NAV_CHARTS in render, under the provider the
    // browser entry renders: a container and no request scope.
    render(
      <NexusProvider container={nexus}>
        <Stub initialEntries={['/']} />
      </NexusProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('survey-7')).toBeDefined();
      expect(screen.getByText('survey-7: docked')).toBeDefined();
    });
    await scope[Symbol.asyncDispose]();
  });

  test('keeps no watch log entry from one request to the next', async ({
    nexus,
  }) => {
    const first = await scopeOf(nexus, 'survey-1');
    const second = await scopeOf(nexus, 'survey-2');
    const read = (scope: typeof first) =>
      loader({
        params: {},
        context: new RouterContextProvider(
          new Map([[NEXUS_SCOPE, existingScope(scope)]]),
        ),
        request: new Request('http://bridge/'),
      } as never);
    expect((await read(first)).entries).toEqual(['survey-1: docked']);
    expect((await read(second)).entries).toEqual(['survey-2: docked']);
    expect(first.get(WATCH_LOG).entries()).not.toContain('survey-2: docked');
    await first[Symbol.asyncDispose]();
    await second[Symbol.asyncDispose]();
  });
});
