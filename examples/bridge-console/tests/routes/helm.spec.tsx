import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import type { Nexus, Scope } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems/charts';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { nexusTest } from '@nexusdi/vitest';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import type { CommandAnswer } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { FakeBridgeLink, fakeBridgeLink, shipAtStart } from '../doubles';
import { built } from '../support/testing-di';
import { scopeWith } from './scope-with';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

const {
  default: Helm,
  action,
  loader,
} = await import('../../app/routes/systems/helm');

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
    [{ path: '/systems/helm', Component: Helm, action, loader }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/systems/helm']} />);
  await screen.findByRole('button', { name: 'Plot course' });
}

/** The text of each gauge in the list named `label`, in order. */
async function gauges(label: string) {
  const list = await screen.findByLabelText(label);
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/** The tick-0 power record with the loads in `grants` asking and granted watts. */
function loadsOf(
  grants: Record<string, readonly [demand: number, allocated: number]>,
  shed: string[] = [],
): ShipReading['power'] {
  return {
    ...shipAtStart.power,
    loads: shipAtStart.power.loads.map((load) => {
      const grant = grants[load.id];
      return grant === undefined
        ? load
        : { ...load, demand: grant[0], allocated: grant[1] };
    }),
    shed,
  };
}

/** The setpoints with the burn at full throttle and the course at 0.733 rad (42 degrees). */
const steering: ShipReading['setpoints'] = {
  ...shipAtStart.setpoints,
  drive: { throttle: 1 },
  helm: { heading: 0.733 },
};

/**
 * Seed 7's helm scenario as the golden holds it, rounded to four significant
 * digits, which is coarser than the eight `/sim` sends: the course 0.733 rad
 * and a burn at level 1, both queued at tick 0. The router sheds both new
 * loads on this tick.
 */
const shed: ShipReading = {
  ...shipAtStart,
  tick: 1,
  time: 0.5,
  power: loadsOf(
    { thrusters: [20_000_000, 0], 'main-drive': [600_000_000, 0] },
    ['thrusters', 'main-drive'],
  ),
  safety: {
    ...shipAtStart.safety,
    alarms: [
      { code: 'LOAD_SHED', subject: 'thrusters' },
      { code: 'LOAD_SHED', subject: 'main-drive' },
    ],
  },
  setpoints: steering,
};

/** The next tick, after the reactor climbs: the thrusters turn at full torque. */
const turning: ShipReading = {
  ...shed,
  tick: 2,
  time: 1,
  power: loadsOf(
    { thrusters: [20_000_000, 20_000_000], 'main-drive': [600_000_000, 0] },
    ['main-drive'],
  ),
  safety: {
    ...shipAtStart.safety,
    alarms: [{ code: 'LOAD_SHED', subject: 'main-drive' }],
  },
  helm: { attitude: 0.0003788, rate: 0.0007576, torque: 5_000_000 },
};

/** Tick 50: the drive burns 14.4 kN while the ship still turns toward the course. */
const offAxis: ShipReading = {
  ...shed,
  tick: 50,
  time: 25,
  power: loadsOf({
    thrusters: [1_595_000, 1_595_000],
    'main-drive': [600_000_000, 600_000_000],
  }),
  safety: shipAtStart.safety,
  drive: {
    thrust: 14_400,
    massFlow: 0.288,
    acceleration: 0.003188,
    velocity: 0.001594,
    distance: 0.0007971,
  },
  helm: { attitude: 0.2567, rate: 0.01322, torque: -398_800 },
};

/** Tick 1,200: the ship has settled on the course and burns along it. */
const aligned: ShipReading = {
  ...offAxis,
  tick: 1200,
  time: 600,
  power: loadsOf({
    thrusters: [0, 0],
    'main-drive': [600_000_000, 600_000_000],
  }),
  drive: {
    thrust: 14_400,
    massFlow: 0.288,
    acceleration: 0.0036,
    velocity: 2.065,
    distance: 593,
  },
  helm: { attitude: 0.733, rate: 0, torque: 0 },
};

/** The ship at rest with a course to TRAPPIST-1e (203 degrees) set: -2.74 rad. */
const trappist: ShipReading = {
  ...shipAtStart,
  setpoints: { ...shipAtStart.setpoints, helm: { heading: -2.74 } },
};

/** A ship that turns so slowly the rate is a hair below zero. */
const tiny: ShipReading = {
  ...shipAtStart,
  helm: { attitude: 0, rate: -1e-9, torque: -1 },
};

/** A link double whose snapshot answers `ship`. */
const linkAt = (ship: ShipReading): typeof FakeBridgeLink =>
  class extends FakeBridgeLink {
    override async snapshot() {
      return ship;
    }
  };

const idleHelm = ['0.0°', '0.0°', '0.00 °/s', '0 N·m', '0.0 MW'] as const;
const idleDrive = [
  '0.00',
  '0.0 MW',
  '0 N',
  '0.000 kg/s',
  '0.0000 m/s²',
  '0.00 m/s',
  '0 m',
] as const;

describe('the helm gauges', () => {
  test('read the ship at rest at tick 0', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await gauges('Helm gauges')).toEqual(idleHelm);
    expect(await gauges('Main drive gauges')).toEqual(idleDrive);
  });

  test('name each gauge', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const names = async (label: string) =>
      [...(await screen.findByLabelText(label)).querySelectorAll('dt')].map(
        (dt) => dt.textContent,
      );
    expect(await names('Helm gauges')).toEqual([
      'Heading',
      'Course',
      'Turn rate',
      'Thruster torque',
      'Thruster power',
    ]);
    expect(await names('Main drive gauges')).toEqual([
      'Burn level',
      'Drive power',
      'Thrust',
      'Propellant flow',
      'Acceleration',
      'Velocity',
      'Distance',
    ]);
  });

  test.for([
    [
      'the tick the router sheds both loads',
      shed,
      ['0.0°', '42.0°', '0.00 °/s', '0 N·m', '0.0 MW'],
      ['1.00', '0.0 MW', '0 N', '0.000 kg/s', '0.0000 m/s²', '0.00 m/s', '0 m'],
    ],
    [
      'the first tick of the turn',
      turning,
      ['0.0°', '42.0°', '0.04 °/s', '5,000,000 N·m', '20.0 MW'],
      ['1.00', '0.0 MW', '0 N', '0.000 kg/s', '0.0000 m/s²', '0.00 m/s', '0 m'],
    ],
    [
      'a burn off the course axis',
      offAxis,
      ['14.7°', '42.0°', '0.76 °/s', '-398,800 N·m', '1.6 MW'],
      [
        '1.00',
        '600.0 MW',
        '14,400 N',
        '0.288 kg/s',
        '0.0032 m/s²',
        '0.00 m/s',
        '0 m',
      ],
    ],
    [
      'a burn on the course',
      aligned,
      ['42.0°', '42.0°', '0.00 °/s', '0 N·m', '0.0 MW'],
      [
        '1.00',
        '600.0 MW',
        '14,400 N',
        '0.288 kg/s',
        '0.0036 m/s²',
        '2.06 m/s',
        '593 m',
      ],
    ],
    [
      'a course to TRAPPIST-1e',
      trappist,
      ['0.0°', '203.0°', '0.00 °/s', '0 N·m', '0.0 MW'],
      idleDrive,
    ],
  ] as const)('read %s', async ([, ship, helm, drive]) => {
    await using scope = await scopeWith(linkAt(ship), built);
    await renderPage(scope);
    expect(await gauges('Helm gauges')).toEqual(helm);
    expect(await gauges('Main drive gauges')).toEqual(drive);
  });

  test('read a hair below zero as 0.00 °/s, never -0.00 °/s', async () => {
    await using scope = await scopeWith(linkAt(tiny), built);
    await renderPage(scope);
    expect(await gauges('Helm gauges')).toEqual([
      '0.0°',
      '0.0°',
      '0.00 °/s',
      '-1 N·m',
      '0.0 MW',
    ]);
  });

  test('head each section at the second level', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Helm', 'Main drive', 'Course', 'Burn']);
  });

  test('say the snapshot is offline when it fails, and keep the controls', async () => {
    class SnapshotDown extends FakeBridgeLink {
      override async snapshot(): Promise<ShipReading> {
        throw new Error('bridge-api answered 503 for /sim');
      }
    }
    await using scope = await scopeWith(SnapshotDown, built);
    await renderPage(scope);
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByLabelText('Helm gauges')).toBeNull();
    expect(screen.queryByLabelText('Main drive gauges')).toBeNull();
    expect(screen.getByRole('button', { name: 'Burn' })).toBeDefined();
  });
});

describe('the course button', () => {
  test('lists the charted stars', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const select = screen.getByRole('combobox');
    expect(select.getAttribute('name')).toBe('to');
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(Object.keys(BUNDLED_CHARTS));
  });

  test('posts the star and shows the tick it queues for', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(screen.getByRole('button', { name: 'Plot course' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(command).toHaveBeenCalledOnce();
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'helm',
      action: 'course',
      to: 'Kepler-442b',
    });
  });
});

describe('the burn button', () => {
  test('posts the level and shows the tick it queues for', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(screen.getByRole('button', { name: 'Burn' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'helm',
      action: 'burn',
      level: 1,
    });
  });

  test('labels the level and bounds it from 0 to 1', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const input = screen.getByLabelText('Burn level');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('1');
    expect(input.getAttribute('step')).toBe('0.01');
  });

  test('shows a refusal with its fix', async () => {
    class Refusing extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 400,
          code: 'MERIDIAN_BAD_COMMAND',
          message:
            'helm burn cannot use the level argument. It takes course with a charted star to steer for and burn with a level from 0 to 1.',
          fix: 'send the arguments in the ranges above.',
        };
      }
    }
    await using scope = await scopeWith(Refusing, built);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Burn' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'helm burn cannot use the level argument. It takes course with a charted star to steer for and burn with a level from 0 to 1.Fix: send the arguments in the ranges above.',
    );
  });
});
