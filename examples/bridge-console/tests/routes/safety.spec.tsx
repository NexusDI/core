import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import type { Nexus, Scope } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { nexusTest } from '@nexusdi/vitest';

import { BRIDGE_LINK, type CommandAnswer } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { FakeBridgeLink, fakeBridgeLink, shipAtStart } from '../doubles';
import { built } from '../support/testing-di';
import { scopeWith } from './scope-with';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

const {
  default: Safety,
  action,
  loader,
} = await import('../../app/routes/systems/safety');

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
    [{ path: '/systems/safety', Component: Safety, action, loader }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/systems/safety']} />);
  await screen.findByRole('button', { name: 'Open door' });
}

/** The text of each gauge in the list `label` names, in order. */
async function gauges(label: string) {
  const list = await screen.findByLabelText(label);
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/**
 * The ship at tick 190 with the habitat-airlock door open and a fire in the
 * reactor bay: unrounded floats in the shape seed 7 gives.
 */
const shipAt190: ShipReading = {
  ...shipAtStart,
  tick: 190,
  time: 95,
  compartments: {
    bridge: {
      ...shipAtStart.compartments.bridge,
      temperature: 292.78815948058684,
      pressure: 101204.28596604968,
    },
    habitat: {
      ...shipAtStart.compartments.habitat,
      temperature: 292.7650957776126,
      pressure: 101205.93067046259,
    },
    'reactor-bay': {
      ...shipAtStart.compartments['reactor-bay'],
      temperature: 311.4902716355417,
      pressure: 104245.3275224233,
    },
    airlock: {
      ...shipAtStart.compartments.airlock,
      temperature: 292.42322343393,
      pressure: 101100.64963292163,
    },
  },
  safety: {
    fires: {
      bridge: 0,
      habitat: 0,
      'reactor-bay': 0.18000000000000002,
      airlock: 0,
    },
    flooded: { bridge: 0, habitat: 0, 'reactor-bay': 1234.5678901234567 },
    alarms: [
      { code: 'FIRE', subject: 'reactor-bay' },
      { code: 'LOAD_SHED', subject: 'life-support' },
    ],
  },
  setpoints: {
    ...shipAtStart.setpoints,
    safety: {
      ...shipAtStart.setpoints.safety,
      doors: {
        ...shipAtStart.setpoints.safety.doors,
        'habitat-airlock': true,
      },
      floods: { ...shipAtStart.setpoints.safety.floods, 'reactor-bay': true },
    },
  },
};

class LinkAt190 extends FakeBridgeLink {
  override async snapshot() {
    return shipAt190;
  }
}

describe('the safety gauges', () => {
  test('say no alarms on the idle ship', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(screen.getByText('No alarms')).toBeDefined();
  });

  test('list each alarm with its subject', async () => {
    await using scope = await scopeWith(LinkAt190, built);
    await renderPage(scope);
    const alarms = screen.getByRole('list', { name: 'Alarms' });
    expect(
      within(alarms)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['FIRE in reactor-bay', 'LOAD_SHED in life-support']);
    expect(screen.queryByText('No alarms')).toBeNull();
  });

  test('show every door shut at tick 0 with the pressure of each side', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await gauges('bridge-habitat door')).toEqual([
      'Shut',
      '101.3 kPa',
      '101.3 kPa',
    ]);
    expect(await gauges('airlock-outer door')).toEqual([
      'Shut',
      '101.3 kPa',
      '0.0 kPa',
    ]);
  });

  test('show an open door and the pressure of each side to 0.1 kPa at tick 190', async () => {
    await using scope = await scopeWith(LinkAt190, built);
    await renderPage(scope);
    expect(await gauges('habitat-airlock door')).toEqual([
      'Open',
      '101.2 kPa',
      '101.1 kPa',
    ]);
    expect(await gauges('habitat-reactor-bay door')).toEqual([
      'Shut',
      '101.2 kPa',
      '104.2 kPa',
    ]);
    expect(await gauges('airlock-outer door')).toEqual([
      'Shut',
      '101.1 kPa',
      '0.0 kPa',
    ]);
  });

  test('show the fire, the flood and the temperature of each charged room', async () => {
    await using scope = await scopeWith(LinkAt190, built);
    await renderPage(scope);
    expect(await gauges('Reactor bay fire suppression')).toEqual([
      '0.18',
      '1,235 mol',
      '311 K',
    ]);
    expect(await gauges('Habitat fire suppression')).toEqual([
      'none',
      '0 mol',
      '293 K',
    ]);
    expect(screen.queryByLabelText('Airlock fire suppression')).toBeNull();
  });

  test('head each section at the second level', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Alarms',
      'Doors',
      'Fire suppression',
      'Door control',
      'Room control',
    ]);
  });

  test('say the snapshot is offline when it fails, and keep the forms', async () => {
    class SnapshotDown extends FakeBridgeLink {
      override async snapshot(): Promise<ShipReading> {
        throw new Error('bridge-api answered 503 for /sim');
      }
    }
    await using scope = await scopeWith(SnapshotDown, built);
    await renderPage(scope);
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByText('No alarms')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close door' })).toBeDefined();
    expect(screen.queryByLabelText('Room')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flood' })).toBeNull();
  });
});

describe('the safety forms', () => {
  /**
   * Clicks the button `name` and gives the command the page sent once the
   * last answer shows.
   */
  async function click(scope: Scope, name: string) {
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(screen.getByRole('button', { name }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(command).toHaveBeenCalledOnce();
    return command.mock.calls[0]?.[0];
  }

  test('open a door', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    fireEvent.change(screen.getByLabelText('Door'), {
      target: { value: 'habitat-airlock' },
    });
    expect(await click(scope, 'Open door')).toStrictEqual({
      system: 'safety',
      action: 'open',
      door: 'habitat-airlock',
    });
  });

  test('close a door', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await click(scope, 'Close door')).toStrictEqual({
      system: 'safety',
      action: 'close',
      door: 'bridge-habitat',
    });
  });

  test('flood a room', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    fireEvent.change(screen.getByLabelText('Room'), {
      target: { value: 'reactor-bay' },
    });
    expect(await click(scope, 'Flood')).toStrictEqual({
      system: 'safety',
      action: 'flood',
      compartment: 'reactor-bay',
    });
  });

  test('drill a room', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await click(scope, 'Drill')).toStrictEqual({
      system: 'safety',
      action: 'drill',
      compartment: 'bridge',
    });
  });

  test('show the flight-log line of an accepted door command', async () => {
    class LoggingLink extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: true,
          tick: 191,
          flightLog: ['survey-9: opened bridge-habitat'],
        };
      }
    }
    await using scope = await scopeWith(LoggingLink, built);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Open door' }));
    expect(await screen.findByText('Queued for tick 191')).toBeDefined();
    expect(screen.getByText('survey-9: opened bridge-habitat')).toBeDefined();
  });

  test('show the refusal of a door and its fix', async () => {
    class RefusingLink extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 409,
          code: 'MERIDIAN_INTERLOCK',
          message:
            'The airlock-outer door holds 101,300 Pa of difference, above the 5,000 Pa interlock.',
          fix: 'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
        };
      }
    }
    await using scope = await scopeWith(RefusingLink, built);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Open door' }));
    expect(
      await screen.findByText(
        'The airlock-outer door holds 101,300 Pa of difference, above the 5,000 Pa interlock.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
      ),
    ).toBeDefined();
  });
});
