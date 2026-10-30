import { fireEvent, screen } from '@testing-library/react';
import type { ShipReading } from '@nexusdi/meridian-systems';
import type { NexusSetupStep } from '@nexusdi/vitest';
import { describe, expect, vi } from 'vitest';

import { BRIDGE_LINK } from '../../app/di/contracts';
import {
  FailingSnapshotLink,
  linkAt,
  shipAtStart,
  idleLoads,
} from '../doubles';
import { test, withLink, type RenderRoute } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const comms = await import('../../app/routes/systems/comms');

/**
 * Renders the page with its loader and action in a request scope, as React
 * Router runs them, and waits for the loader's data.
 */
async function renderPage(
  renderRoute: RenderRoute,
  overrides?: NexusSetupStep,
) {
  const page = await renderRoute(comms, {
    path: '/systems/comms',
    overrides,
  });
  await screen.findByRole('button', { name: 'Hail fleet traffic control' });
  return page.scope;
}

/** The text of each gauge in the comms list, in order. */
async function gauges() {
  const list = await screen.findByLabelText('Comms gauges');
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/** The idle power record with the comms load asking `demand` W and granted `allocated` W. */
function loadAt(demand: number, allocated: number): ShipReading['power'] {
  return {
    ...shipAtStart.power,
    loads: idleLoads.map((load) =>
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

describe('the comms gauges', () => {
  test('read standby with no hail and no message at tick 0', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute);
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
  ] as const)('read %s', async ([, ship, expected], { renderRoute }) => {
    await renderPage(renderRoute, withLink(linkAt(ship)));
    expect(await gauges()).toEqual(expected);
  });

  test('list each message with its sender and tick', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(linkAt(replied)));
    const items = screen
      .getByRole('list', { name: 'Messages' })
      .querySelectorAll('li');
    expect([...items].map((item) => item.textContent)).toEqual([
      'fleet traffic control: sector clear (tick 5)',
    ]);
    expect(screen.queryByText('No messages')).toBeNull();
  });

  test('head each section at the second level', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Comms', 'Messages', 'Hail']);
  });

  test('say the snapshot is offline when it fails, and keep the button', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(FailingSnapshotLink));
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByLabelText('Comms gauges')).toBeNull();
    expect(screen.queryByText('No messages')).toBeNull();
  });
});

describe('the hail button', () => {
  test('posts a hail and shows the tick it queues for', async ({
    renderRoute,
  }) => {
    const scope = await renderPage(renderRoute);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(
      screen.getByRole('button', { name: 'Hail fleet traffic control' }),
    );
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1.',
    );
    expect(command).toHaveBeenCalledOnce();
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'comms',
      action: 'hail',
    });
  });
});
