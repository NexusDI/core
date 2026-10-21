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
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
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

  /** Runs the action on a POST of `fields`, as a crafted request would send it. */
  const post = (scope: Scope, fields: Record<string, string>) =>
    action({
      params: {},
      context: new RouterContextProvider(
        new Map([[NEXUS_SCOPE, existingScope(scope)]]),
      ),
      request: new Request('http://bridge/systems/engineering', {
        method: 'POST',
        body: new URLSearchParams(fields),
      }),
    } as never);

  test('forwards a throttle with no level, and the backend refuses it', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    expect(await post(scope, { command: 'throttle' })).toEqual({
      accepted: false,
      status: 400,
      code: 'MERIDIAN_BAD_COMMAND',
      message: `engineering throttle got an argument it cannot use. It takes ${EXPECTED}.`,
      fix: 'send the arguments in the ranges above.',
    });
  });

  test('forwards a shields command with no raised, and the backend refuses it', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    expect(await post(scope, { command: 'shields' })).toMatchObject({
      accepted: false,
      status: 400,
      message: `engineering shields got an argument it cannot use. It takes ${EXPECTED}.`,
    });
  });

  test('forwards an unknown command, and the backend refuses it', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    expect(await post(scope, { command: 'vent' })).toEqual({
      accepted: false,
      status: 400,
      code: 'MERIDIAN_BAD_COMMAND',
      message: `engineering has no action 'vent'. It takes ${EXPECTED}.`,
      fix: 'send one of the actions above with its arguments.',
    });
  });
});

/** What engineering's refusals say it takes, as meridian-systems words it. */
const EXPECTED =
  'throttle with a level from 0 to 1 and shields with raised true or false';
