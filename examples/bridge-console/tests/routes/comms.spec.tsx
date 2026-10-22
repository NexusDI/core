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
  default: Comms,
  action,
  loader,
} = await import('../../app/routes/systems/comms');

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
    [{ path: '/systems/comms', Component: Comms, action, loader }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/systems/comms']} />);
  await screen.findByRole('button', { name: 'Hail fleet traffic control' });
}

/** The text of each gauge in the comms list, in order. */
async function gauges() {
  const list = await screen.findByLabelText('Comms gauges');
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/** The tick-0 power record with the comms load asking `demand` W and granted `allocated` W. */
function loadAt(demand: number, allocated: number): ShipReading['power'] {
  return {
    ...shipAtStart.power,
    loads: shipAtStart.power.loads.map((load) =>
      load.id === 'comms' ? { ...load, demand, allocated } : load,
    ),
  };
}

/** The ship on the tick the array sends the hail: the array draws 5 MW. */
const sending: ShipReading = {
  ...shipAtStart,
  tick: 1,
  time: 0.5,
  power: loadAt(5_000_000, 5_000_000),
  comms: { status: 'awaiting reply', sent: 1, messages: [] },
};

/** A hail on a cold reactor: the array asks 5 MW, the router sheds it and grants 0 W. */
const unpowered: ShipReading = {
  ...shipAtStart,
  tick: 2,
  time: 1,
  power: { ...loadAt(5_000_000, 0), shed: ['comms'] },
  comms: { status: 'no power', sent: null, messages: [] },
  setpoints: { ...shipAtStart.setpoints, comms: { hail: true } },
};

/** A hail waits for the reply: the load is back to 0 W and the flag is still up. */
const waiting: ShipReading = {
  ...shipAtStart,
  tick: 3,
  time: 1.5,
  comms: { status: 'awaiting reply', sent: 1, messages: [] },
  setpoints: { ...shipAtStart.setpoints, comms: { hail: true } },
};

/** Four ticks after the send the reply is in. */
const replied: ShipReading = {
  ...shipAtStart,
  tick: 5,
  time: 2.5,
  comms: {
    status: 'standby',
    sent: 1,
    messages: [
      { tick: 5, from: 'fleet traffic control', text: 'sector clear' },
    ],
  },
};

/** The ship with no subspace link: the hail stays queued. */
const offline: ShipReading = {
  ...shipAtStart,
  tick: 20,
  time: 10,
  comms: { status: 'no subspace link', sent: null, messages: [] },
  setpoints: { ...shipAtStart.setpoints, comms: { hail: true } },
};

/** A link double whose snapshot answers `ship`. */
const linkAt = (ship: ShipReading): typeof FakeBridgeLink =>
  class extends FakeBridgeLink {
    override async snapshot() {
      return ship;
    }
  };

describe('the comms gauges', () => {
  test('read standby with no hail and no message at tick 0', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await gauges()).toEqual(['standby', 'No', 'none', '0.0 MW']);
    expect(screen.getByText('No messages')).toBeDefined();
  });

  test.for([
    [
      'the tick the array sends',
      sending,
      ['awaiting reply', 'No', 'tick 1', '5.0 MW'],
    ],
    [
      'the ticks it waits for the reply',
      waiting,
      ['awaiting reply', 'Yes', 'tick 1', '0.0 MW'],
    ],
    [
      'a hail the router shed',
      unpowered,
      ['no power', 'Yes', 'none', '0.0 MW'],
    ],
    ['the tick of the reply', replied, ['standby', 'No', 'tick 1', '0.0 MW']],
    [
      'a ship with no subspace link',
      offline,
      ['no subspace link', 'Yes', 'none', '0.0 MW'],
    ],
  ] as const)('read %s', async ([, ship, expected]) => {
    await using scope = await scopeWith(linkAt(ship), built);
    await renderPage(scope);
    expect(await gauges()).toEqual(expected);
  });

  test('list each message with its sender and tick', async () => {
    await using scope = await scopeWith(linkAt(replied), built);
    await renderPage(scope);
    const items = screen
      .getByRole('list', { name: 'Messages' })
      .querySelectorAll('li');
    expect([...items].map((item) => item.textContent)).toEqual([
      'fleet traffic control: sector clear (tick 5)',
    ]);
    expect(screen.queryByText('No messages')).toBeNull();
  });

  test('head each section at the second level', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Comms', 'Messages', 'Hail']);
  });

  test('say the snapshot is offline when it fails, and keep the button', async () => {
    class SnapshotDown extends FakeBridgeLink {
      override async snapshot(): Promise<ShipReading> {
        throw new Error('bridge-api answered 503 for /sim');
      }
    }
    await using scope = await scopeWith(SnapshotDown, built);
    await renderPage(scope);
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByLabelText('Comms gauges')).toBeNull();
    expect(screen.queryByText('No messages')).toBeNull();
  });
});

describe('the hail button', () => {
  test('posts a hail and shows the tick it queues for', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(
      screen.getByRole('button', { name: 'Hail fleet traffic control' }),
    );
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(command).toHaveBeenCalledOnce();
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'comms',
      action: 'hail',
    });
  });
});
