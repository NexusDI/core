import { afterAll, describe, expect, test as base, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import type { Nexus, Scope } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
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
  default: Weapons,
  action,
  loader,
} = await import('../../app/routes/systems/weapons');

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
    [{ path: '/systems/weapons', Component: Weapons, action, loader }],
    new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
  );
  render(<Stub initialEntries={['/systems/weapons']} />);
  await screen.findByRole('button', { name: 'Fire' });
}

/** The text of each gauge in the list named `label`, in order. */
async function gauges(label: string) {
  const list = await screen.findByLabelText(label);
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/**
 * The power record with the railgun's load, which asks `demand` and is
 * granted `allocated`.
 */
function railgunLoad(
  demand: number,
  allocated: number,
  shed: string[] = [],
): ShipReading['power'] {
  return {
    ...shipAtStart.power,
    loads: [
      ...shipAtStart.power.loads.filter(({ id }) => id !== 'railgun'),
      { id: 'railgun', priority: 6, demand, allocated },
    ],
    shed,
  };
}

/** The setpoints with the mount armed and `range` waiting. */
const armedAt = (range: number | null): ShipReading['setpoints'] => ({
  ...shipAtStart.setpoints,
  weapons: { armed: true, range },
});

/**
 * Seed 7's weapons scenario as the golden holds it, rounded to four
 * significant digits as `/sim` sends it. Tick 31: the shot at 10 km waits
 * while the capacitor holds 150 MJ and draws 300 MW.
 */
const waiting: ShipReading = {
  ...shipAtStart,
  tick: 31,
  time: 15.5,
  power: railgunLoad(300_000_000, 300_000_000),
  weapons: {
    status: 'charging',
    charge: 150_000_000,
    shots: 0,
    hits: 0,
    lastShot: null,
  },
  setpoints: armedAt(10_000),
};

/** Tick 32: the shot hit at 10 km and emptied the capacitor. */
const hit: ShipReading = {
  ...waiting,
  tick: 32,
  time: 16,
  weapons: {
    status: 'charging',
    charge: 0,
    shots: 1,
    hits: 1,
    lastShot: { tick: 32, range: 10_000, hit: true },
  },
  setpoints: armedAt(null),
};

/** Tick 35: the capacitor is full at 400 MJ and draws 200 MW. */
const charged: ShipReading = {
  ...hit,
  tick: 35,
  time: 17.5,
  power: railgunLoad(200_000_000, 200_000_000),
  weapons: { ...hit.weapons, status: 'charged', charge: 400_000_000 },
};

/** Tick 36: the full capacitor draws nothing. */
const full: ShipReading = {
  ...charged,
  tick: 36,
  time: 18,
  power: railgunLoad(0, 0),
};

/** Tick 37: a second shot missed at 50 km and left 100 MJ. */
const missed: ShipReading = {
  ...full,
  tick: 37,
  time: 18.5,
  weapons: {
    status: 'charging',
    charge: 100_000_000,
    shots: 2,
    hits: 1,
    lastShot: { tick: 37, range: 50_000, hit: false },
  },
};

/** Tick 62: the router sheds the railgun with a shot at 0 m waiting. */
const shed: ShipReading = {
  ...shipAtStart,
  tick: 62,
  time: 31,
  power: railgunLoad(300_000_000, 0, ['railgun']),
  weapons: {
    status: 'held',
    charge: 150_000_000,
    shots: 0,
    hits: 0,
    lastShot: null,
  },
  setpoints: armedAt(0),
};

/** A link double whose snapshot answers `ship`. */
const linkAt = (ship: ShipReading): typeof FakeBridgeLink =>
  class extends FakeBridgeLink {
    override async snapshot() {
      return ship;
    }
  };

const idle = [
  'idle',
  'No',
  '0.0 MJ',
  '0.0 MW',
  'none',
  '0',
  '0',
  'none',
] as const;

describe('the railgun gauges', () => {
  test('read the ship with the mount idle at tick 0', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(await gauges('Railgun gauges')).toEqual(idle);
  });

  test('name each gauge', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const names = [
      ...(await screen.findByLabelText('Railgun gauges')).querySelectorAll(
        'dt',
      ),
    ].map((dt) => dt.textContent);
    expect(names).toEqual([
      'Status',
      'Armed',
      'Capacitor charge',
      'Capacitor power',
      'Shot waiting',
      'Shots fired',
      'Hits',
      'Last shot',
    ]);
  });

  test.for([
    [
      'a shot waiting at tick 31',
      waiting,
      ['charging', 'Yes', '150.0 MJ', '300.0 MW', '10,000 m', '0', '0', 'none'],
    ],
    [
      'the hit at tick 32',
      hit,
      [
        'charging',
        'Yes',
        '0.0 MJ',
        '300.0 MW',
        'none',
        '1',
        '1',
        'hit at 10,000 m, tick 32',
      ],
    ],
    [
      'a full capacitor at tick 35',
      charged,
      [
        'charged',
        'Yes',
        '400.0 MJ',
        '200.0 MW',
        'none',
        '1',
        '1',
        'hit at 10,000 m, tick 32',
      ],
    ],
    [
      'the full capacitor drawing nothing at tick 36',
      full,
      [
        'charged',
        'Yes',
        '400.0 MJ',
        '0.0 MW',
        'none',
        '1',
        '1',
        'hit at 10,000 m, tick 32',
      ],
    ],
    [
      'the miss at tick 37',
      missed,
      [
        'charging',
        'Yes',
        '100.0 MJ',
        '0.0 MW',
        'none',
        '2',
        '1',
        'miss at 50,000 m, tick 37',
      ],
    ],
    [
      'the railgun shed at tick 62',
      shed,
      ['held', 'Yes', '150.0 MJ', '0.0 MW', '0 m', '0', '0', 'none'],
    ],
  ] as const)('read %s', async ([, ship, expected]) => {
    await using scope = await scopeWith(linkAt(ship), built);
    await renderPage(scope);
    expect(await gauges('Railgun gauges')).toEqual(expected);
  });

  test('head each section at the second level', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Railgun', 'Fire']);
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
    expect(screen.queryByLabelText('Railgun gauges')).toBeNull();
    expect(screen.getByRole('button', { name: 'Fire' })).toBeDefined();
  });
});

describe('the fire form', () => {
  test('bounds the range field from 0 to 100,000 m in steps of 1', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const field = screen.getByLabelText('Range (m)');
    expect(field.getAttribute('name')).toBe('range');
    expect(field.getAttribute('min')).toBe('0');
    expect(field.getAttribute('max')).toBe('100000');
    expect(field.getAttribute('step')).toBe('1');
    expect((field as HTMLInputElement).value).toBe('10000');
  });

  test('posts the range and shows the tick it queues for', async ({
    nexus,
  }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(command).toHaveBeenCalledOnce();
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'weapons',
      action: 'fire',
      range: 10_000,
    });
  });

  test('posts the range the reader typed', async ({ nexus }) => {
    await using scope = await scopeOf(nexus);
    await renderPage(scope);
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.change(screen.getByLabelText('Range (m)'), {
      target: { value: '50000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    await screen.findByRole('status');
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'weapons',
      action: 'fire',
      range: 50_000,
    });
  });

  test('shows a refusal with its fix', async () => {
    class Refusing extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 409,
          code: 'MERIDIAN_POWER_BUDGET',
          message:
            'The railgun load needs 300 MW, and the router has 0 MW free beside the loads above it.',
          fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
        };
      }
    }
    await using scope = await scopeWith(Refusing, built);
    await renderPage(scope);
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The railgun load needs 300 MW, and the router has 0 MW free beside the loads above it.Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
    );
  });
});
