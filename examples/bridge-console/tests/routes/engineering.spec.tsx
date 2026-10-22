import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import type { Nexus, Scope } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { nexusTest } from '@nexusdi/vitest';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { FakeBridgeLink, fakeBridgeLink, shipAtStart } from '../doubles';
import { built } from '../support/testing-di';
import { scopeWith } from './scope-with';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

const {
  default: Engineering,
  action,
  loader,
} = await import('../../app/routes/systems/engineering');

afterAll(() => Promise.all(built.map((ship) => ship[Symbol.asyncDispose]())));

/** A fresh BridgeConsole testing container per test, with the fake link. */
const test = nexusTest(base, BridgeConsole, {
  setup: (builder) => builder.override(BRIDGE_LINK, fakeBridgeLink),
});

const scopeOf = (ship: Nexus) =>
  ship.createScope({
    request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
  });

/**
 * Renders the page with its loader and action in `scope`, as React Router
 * runs them, and waits for the loader's data.
 */
async function renderPage(scope: Scope) {
  const Stub = createRoutesStub(
    [{ path: '/systems/engineering', Component: Engineering, action, loader }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/systems/engineering']} />);
  await screen.findByRole('button', { name: 'Set throttle' });
}

describe('the engineering route', () => {
  test('renders the throttle and shields forms', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(screen.getByLabelText('Throttle')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Set throttle' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Raise shields' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Lower shields' })).toBeDefined();
  });

  test('shows the tick that applies a throttle', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Set throttle' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
  });

  test('shows the refusal of a shields raise and its fix', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
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

  /**
   * Runs the action on a POST of `fields`, as a crafted request would send
   * it, and gives the command it handed the scope's bridge link.
   */
  async function sent(scope: Scope, fields: Record<string, string>) {
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    const url = new URL('http://bridge/systems/engineering');
    const args: Parameters<typeof action>[0] = {
      request: new Request(url, {
        method: 'POST',
        body: new URLSearchParams(fields),
      }),
      url,
      pattern: '/systems/engineering',
      params: {},
      context: new RouterContextProvider(
        new Map([[NEXUS_SCOPE, existingScope(scope)]]),
      ),
    };
    await action(args);
    expect(command).toHaveBeenCalledOnce();
    return command.mock.calls[0]?.[0];
  }

  test('forwards a throttle with no level as sent', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    expect(await sent(scope, { command: 'throttle' })).toStrictEqual({
      system: 'engineering',
      action: 'throttle',
    });
  });

  test('forwards a shields command with no raised as sent', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    expect(await sent(scope, { command: 'shields' })).toStrictEqual({
      system: 'engineering',
      action: 'shields',
    });
  });

  test('forwards an unknown command as sent', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    expect(await sent(scope, { command: 'vent' })).toStrictEqual({
      system: 'engineering',
      action: 'vent',
    });
  });
});

/** The text of each gauge on the page, in order. */
async function gauges() {
  const list = await screen.findByLabelText('Engineering gauges');
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

describe('the engineering gauges', () => {
  test('read the idle reactor at tick 0', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await gauges()).toEqual(['0.00', '0.0 MW', '500.0 K', '0.0 MW']);
  });

  test('read the reactor, the coolant and the shields from the snapshot', async () => {
    // Seed 7 at tick 18, after a throttle of 1 at tick 0 and a shields raise
    // at tick 17, which the router fits once the output passes 200 MW. The
    // numbers are the ship's own floats. bridge-api's readShip rounds them to
    // four digits, and the page must read right without it.
    const busy: ShipReading = {
      ...shipAtStart,
      tick: 18,
      time: 9,
      reactor: {
        level: 0.18000000000000002,
        thermal: 653400000.0000001,
        electric: 217800000.00000003,
        tripped: false,
      },
      coolant: { temperature: 502.49791096128916 },
      power: {
        output: 217800000.00000003,
        loads: [
          { id: 'shields', priority: 2, demand: 200e6, allocated: 200e6 },
        ],
        shed: [],
      },
      setpoints: { reactor: { throttle: 1 }, shields: { raised: true } },
    };
    class BusyLink extends FakeBridgeLink {
      override async snapshot() {
        return busy;
      }
    }
    await using scope = await scopeWith(BusyLink, built);
    await renderPage(scope);
    expect(await gauges()).toEqual(['0.18', '217.8 MW', '502.5 K', '200.0 MW']);
  });

  test('group the thousands of the full reactor output', async () => {
    const full: ShipReading = {
      ...shipAtStart,
      reactor: { level: 1, thermal: 3.63e9, electric: 1.21e9, tripped: false },
      power: { output: 1.21e9, loads: [], shed: [] },
    };
    class FullLink extends FakeBridgeLink {
      override async snapshot() {
        return full;
      }
    }
    await using scope = await scopeWith(FullLink, built);
    await renderPage(scope);
    expect((await gauges())[1]).toBe('1,210.0 MW');
  });

  test('say they are offline when the backend fails, and keep the forms', async () => {
    class DownLink extends FakeBridgeLink {
      override async snapshot(): Promise<ShipReading> {
        throw new Error('bridge-api answered 503 for /sim');
      }
    }
    await using scope = await scopeWith(DownLink, built);
    await renderPage(scope);
    expect(await screen.findByText('Gauges offline')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Set throttle' })).toBeDefined();
  });
});
