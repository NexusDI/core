import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  default: Airlock,
  action,
  loader,
} = await import('../../app/routes/airlock');

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
    [{ path: '/airlock', Component: Airlock, action, loader }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/airlock']} />);
  await screen.findByRole('button', { name: 'Open door' });
}

/** The text of each gauge in the list `label` names, in order. */
async function gauges(label: string) {
  const list = await screen.findByLabelText(label);
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/**
 * The ship at tick 318 of the airlock drill under the interlock, from seed 7's
 * unrounded floats. The pump is off. The vent and the outer door stand open.
 */
const venting: ShipReading = {
  ...shipAtStart,
  tick: 318,
  time: 159,
  compartments: {
    bridge: {
      ...shipAtStart.compartments.bridge,
      temperature: 292.8509719320864,
      pressure: 101240.19168875556,
    },
    habitat: {
      ...shipAtStart.compartments.habitat,
      temperature: 292.8542985611156,
      pressure: 110418.58883411346,
    },
    'reactor-bay': {
      ...shipAtStart.compartments['reactor-bay'],
      temperature: 292.9159849681482,
      pressure: 101270.95800492141,
    },
    airlock: {
      ...shipAtStart.compartments.airlock,
      temperature: 292.6889217238886,
      pressure: 399.3048615004464,
    },
  },
  setpoints: {
    ...shipAtStart.setpoints,
    lifeSupport: {
      ...shipAtStart.setpoints.lifeSupport,
      online: true,
      vents: { airlock: true },
      pumps: { airlock: 'off' },
    },
    safety: {
      ...shipAtStart.setpoints.safety,
      doors: { ...shipAtStart.setpoints.safety.doors, 'airlock-outer': true },
    },
  },
};

/**
 * The ship at tick 446 of the same drill, with the pump filling. The vent and
 * both airlock doors are shut.
 */
const filling: ShipReading = {
  ...venting,
  tick: 446,
  time: 223,
  compartments: {
    bridge: {
      ...venting.compartments.bridge,
      temperature: 292.81705395283814,
      pressure: 101221.62494988002,
    },
    habitat: {
      ...venting.compartments.habitat,
      temperature: 292.8100326274609,
      pressure: 100806.05771251679,
    },
    'reactor-bay': {
      ...venting.compartments['reactor-bay'],
      temperature: 292.8822909017051,
      pressure: 101259.31077514551,
    },
    airlock: {
      ...venting.compartments.airlock,
      temperature: 292.56875436809247,
      pressure: 95814.93263670888,
    },
  },
  setpoints: {
    ...venting.setpoints,
    lifeSupport: {
      ...venting.setpoints.lifeSupport,
      vents: { airlock: false },
      pumps: { airlock: 'fill' },
    },
    safety: {
      ...venting.setpoints.safety,
      doors: { ...venting.setpoints.safety.doors, 'airlock-outer': false },
    },
  },
};

class LinkVenting extends FakeBridgeLink {
  override async snapshot() {
    return venting;
  }
}

class LinkFilling extends FakeBridgeLink {
  override async snapshot() {
    return filling;
  }
}

describe('the airlock gauges', () => {
  test('show the pump off and the vent shut, with both doors shut, at tick 0', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await gauges('Airlock pump and vent')).toEqual(['off', 'Shut']);
    expect(await gauges('habitat-airlock door')).toEqual([
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

  test('show an open vent and an open outer door with each side to 0.1 kPa', async () => {
    await using scope = await scopeWith(LinkVenting, built);
    await renderPage(scope);
    expect(await gauges('Airlock pump and vent')).toEqual(['off', 'Open']);
    expect(await gauges('habitat-airlock door')).toEqual([
      'Shut',
      '110.4 kPa',
      '0.4 kPa',
    ]);
    expect(await gauges('airlock-outer door')).toEqual([
      'Open',
      '0.4 kPa',
      '0.0 kPa',
    ]);
  });

  test('show a filling pump and a shut vent', async () => {
    await using scope = await scopeWith(LinkFilling, built);
    await renderPage(scope);
    expect(await gauges('Airlock pump and vent')).toEqual(['fill', 'Shut']);
    expect(await gauges('habitat-airlock door')).toEqual([
      'Shut',
      '100.8 kPa',
      '95.8 kPa',
    ]);
    expect(await gauges('airlock-outer door')).toEqual([
      'Shut',
      '95.8 kPa',
      '0.0 kPa',
    ]);
  });

  test('list the two airlock doors and no other', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(screen.queryByLabelText('bridge-habitat door')).toBeNull();
    expect(screen.queryByLabelText('habitat-reactor-bay door')).toBeNull();
    const options = [
      ...screen.getByLabelText<HTMLSelectElement>('Door').options,
    ].map((option) => option.value);
    expect(options).toEqual(['habitat-airlock', 'airlock-outer']);
  });

  test('head each section at the second level', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Airlock', 'Doors', 'Pump and vent', 'Door control']);
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
    expect(screen.queryByLabelText('airlock-outer door')).toBeNull();
    expect(screen.getByRole('button', { name: 'Set pump' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close door' })).toBeDefined();
  });
});

describe('the airlock forms', () => {
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

  test('set the pump as a life-support command', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    fireEvent.change(screen.getByLabelText('Airlock pump mode'), {
      target: { value: 'evacuate' },
    });
    expect(await click(scope, 'Set pump')).toStrictEqual({
      system: 'life-support',
      action: 'pump',
      compartment: 'airlock',
      mode: 'evacuate',
    });
  });

  test('open the vent as a life-support command', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await click(scope, 'Open vent')).toStrictEqual({
      system: 'life-support',
      action: 'vent',
      compartment: 'airlock',
      open: true,
    });
  });

  test('shut the vent as a life-support command', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await click(scope, 'Shut vent')).toStrictEqual({
      system: 'life-support',
      action: 'vent',
      compartment: 'airlock',
      open: false,
    });
  });

  test('open a door as a safety command', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    fireEvent.change(screen.getByLabelText('Door'), {
      target: { value: 'airlock-outer' },
    });
    expect(await click(scope, 'Open door')).toStrictEqual({
      system: 'safety',
      action: 'open',
      door: 'airlock-outer',
    });
  });

  test('close a door as a safety command', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await click(scope, 'Close door')).toStrictEqual({
      system: 'safety',
      action: 'close',
      door: 'habitat-airlock',
    });
  });

  test('send an empty system for an action the page does not post', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    const url = new URL('http://bridge/airlock');
    await action({
      request: new Request(url, {
        method: 'POST',
        body: new URLSearchParams({ command: 'constructor' }),
      }),
      url,
      pattern: '/airlock',
      params: {},
      context: new RouterContextProvider(
        new Map([[NEXUS_SCOPE, existingScope(scope)]]),
      ),
    });
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: '',
      action: 'constructor',
    });
  });

  test('show the flight-log line of an accepted door command', async () => {
    class LoggingLink extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: true,
          tick: 341,
          flightLog: ['survey-9: opened airlock-outer'],
        };
      }
    }
    await using scope = await scopeWith(LoggingLink, built);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Open door' }));
    expect(await screen.findByText('Queued for tick 341')).toBeDefined();
    expect(screen.getByText('survey-9: opened airlock-outer')).toBeDefined();
  });

  test('show the refusal of a door and its fix', async () => {
    class RefusingLink extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 409,
          code: 'MERIDIAN_INTERLOCK',
          message:
            'The airlock-outer door holds 9,089 Pa of difference, above the 5,000 Pa interlock.',
          fix: 'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
        };
      }
    }
    await using scope = await scopeWith(RefusingLink, built);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Open door' }));
    expect(
      await screen.findByText(
        'The airlock-outer door holds 9,089 Pa of difference, above the 5,000 Pa interlock.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
      ),
    ).toBeDefined();
  });
});
