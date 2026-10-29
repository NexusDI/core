import { fireEvent, screen, within } from '@testing-library/react';
import type { Scope } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import type { NexusSetupStep } from '@nexusdi/vitest';
import { describe, expect, vi } from 'vitest';

import { BRIDGE_LINK, type CommandAnswer } from '../../app/di/contracts';
import {
  FailingSnapshotLink,
  FakeBridgeLink,
  linkAt,
  shipAtStart,
} from '../doubles';
import { test, withLink, type RenderRoute } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const safety = await import('../../app/routes/systems/safety');

/**
 * Renders the page with its loader and action in a request scope, as React
 * Router runs them, and waits for the loader's data.
 */
async function renderPage(
  renderRoute: RenderRoute,
  overrides?: NexusSetupStep,
) {
  const page = await renderRoute(safety, {
    path: '/systems/safety',
    overrides,
  });
  await screen.findByRole('button', { name: 'Open door' });
  return page.scope;
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
    ...shipAtStart.compartments,
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
    fires: { ...shipAtStart.safety.fires, 'reactor-bay': 0.18000000000000002 },
    flooded: {
      ...shipAtStart.safety.flooded,
      'reactor-bay': 1234.5678901234567,
    },
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

const LinkAt190 = linkAt(shipAt190);

describe('the safety gauges', () => {
  test('say no alarms on the idle ship', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    expect(screen.getByText('No alarms')).toBeDefined();
  });

  test('list each alarm with its subject', async ({ renderRoute }) => {
    await renderPage(renderRoute, withLink(LinkAt190));
    const alarms = screen.getByRole('list', { name: 'Alarms' });
    expect(
      within(alarms)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['FIRE in reactor-bay', 'LOAD_SHED in life-support']);
    expect(screen.queryByText('No alarms')).toBeNull();
  });

  test('show every door shut at tick 0 with the pressure of each side', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute);
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
    expect(await gauges('shuttle-bay-drone-bay door')).toEqual([
      'Shut',
      '0.0 kPa',
      '0.0 kPa',
    ]);
    expect(await gauges('engineering-reactor-bay door')).toEqual([
      'Shut',
      '101.3 kPa',
      '101.3 kPa',
    ]);
    expect(screen.getAllByLabelText(/ door$/)).toHaveLength(16);
  });

  test('show an open door and the pressure of each side to 0.1 kPa at tick 190', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(LinkAt190));
    expect(await gauges('habitat-airlock door')).toEqual([
      'Open',
      '101.2 kPa',
      '101.1 kPa',
    ]);
    expect(await gauges('engineering-reactor-bay door')).toEqual([
      'Shut',
      '101.3 kPa',
      '104.2 kPa',
    ]);
    expect(await gauges('airlock-outer door')).toEqual([
      'Shut',
      '101.1 kPa',
      '0.0 kPa',
    ]);
  });

  test('show the fire, the flood and the temperature of each charged room', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(LinkAt190));
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

  test('head each section at the second level', async ({ renderRoute }) => {
    await renderPage(renderRoute);
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

  test('say the snapshot is offline when it fails, and keep the forms', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(FailingSnapshotLink));
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

  test('open a door', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    fireEvent.change(screen.getByLabelText('Door'), {
      target: { value: 'habitat-airlock' },
    });
    expect(await click(scope, 'Open door')).toStrictEqual({
      system: 'safety',
      action: 'open',
      door: 'habitat-airlock',
    });
  });

  test('close a door', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    expect(await click(scope, 'Close door')).toStrictEqual({
      system: 'safety',
      action: 'close',
      door: 'bridge-habitat',
    });
  });

  test('flood a room', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    fireEvent.change(screen.getByLabelText('Room'), {
      target: { value: 'reactor-bay' },
    });
    expect(await click(scope, 'Flood')).toStrictEqual({
      system: 'safety',
      action: 'flood',
      compartment: 'reactor-bay',
    });
  });

  test('drill a room', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    expect(await click(scope, 'Drill')).toStrictEqual({
      system: 'safety',
      action: 'drill',
      compartment: 'bridge',
    });
  });

  test('show the flight-log line of an accepted door command', async ({
    renderRoute,
  }) => {
    class LoggingLink extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: true,
          tick: 191,
          flightLog: ['survey-9: opened bridge-habitat'],
        };
      }
    }
    await renderPage(renderRoute, withLink(LoggingLink));
    fireEvent.click(screen.getByRole('button', { name: 'Open door' }));
    expect(await screen.findByText('Queued for tick 191')).toBeDefined();
    expect(screen.getByText('survey-9: opened bridge-habitat')).toBeDefined();
  });

  test('show the refusal of a door and its fix', async ({ renderRoute }) => {
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
    await renderPage(renderRoute, withLink(RefusingLink));
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
