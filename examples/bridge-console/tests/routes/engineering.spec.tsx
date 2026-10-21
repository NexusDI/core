import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import type { Nexus, Scope } from '@nexusdi/core';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { nexusTest } from '@nexusdi/vitest';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { fakeBridgeLink } from '../doubles';
import { built } from '../support/testing-di';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

const { default: Engineering, action } =
  await import('../../app/routes/systems/engineering');

afterAll(() => Promise.all(built.map((ship) => ship[Symbol.asyncDispose]())));

/** A fresh BridgeConsole testing container per test, with the fake link. */
const test = nexusTest(base, BridgeConsole, {
  setup: (builder) => builder.override(BRIDGE_LINK, fakeBridgeLink),
});

const scopeOf = (ship: Nexus) =>
  ship.createScope({
    request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
  });

/** Renders the page with its action in `scope`, as React Router runs it. */
function renderPage(scope: Scope) {
  const Stub = createRoutesStub(
    [{ path: '/systems/engineering', Component: Engineering, action }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/systems/engineering']} />);
}

describe('the engineering route', () => {
  test('renders the throttle and shields forms', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    renderPage(scope);
    expect(screen.getByLabelText('Throttle')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Set throttle' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Raise shields' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Lower shields' })).toBeDefined();
  });

  test('shows the tick that applies a throttle', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect(await screen.findByText('Queued for tick 1')).toBeDefined();
  });

  test('shows the refusal of a shields raise and its fix', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Raise shields' }));
    expect(
      await screen.findByText(
        'The shields load needs 200 MW, and the router has 0 MW free beside the loads above it.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      ),
    ).toBeDefined();
  });
});
