import { all, check, defineModule, Nexus, provide } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { Engineering } from '../src/systems/engineering/engineering.module';
import * as packageRoot from '../src/index';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { Simulation } from '../src/simulation/simulation.module';
import {
  COOLANT_LOOP,
  type IPowerConsumer,
  type IPowerRouter,
  POWER_CONSUMERS,
  POWER_ROUTER,
  REACTOR,
  SHIELD_GRID,
} from '../src/systems/engineering/contracts';
import { WEAPON_MOUNT } from '../src/systems/weapons/contracts';
import { RailgunMount } from '../src/systems/weapons/railgun-mount';
import { WeaponsPower } from '../src/systems/weapons/weapons-power';
import { Weapons } from '../src/systems/weapons/weapons.module';

import { shipRoot } from './ship-root';
import { shipTest } from './fixtures';
import { loadOf, SHIP_OPTIONS, throttle } from './support';

/** The system modules whose tokens these cases read from the root. */
const READS = [Engineering];
const test = shipTest(shipRoot({ reads: READS }));

const shields = (desk: ICommandDesk, raised: boolean) =>
  desk.submit({ system: 'engineering', action: 'shields', raised });
/** The shields' record among the tick's loads, which other systems join. */
const shieldsLoad = (ship: ShipSnapshot) => loadOf(ship, 'shields');

describe('Engineering', () => {
  it('passes the check', () => {
    expect(() => check(shipRoot({ reads: READS }))).not.toThrow();
  });

  test('shows its panel to the root and keeps its pipes', ({ nexus: ship }) => {
    expect(() => ship.get(COOLANT_LOOP)).toThrow(
      expect.objectContaining({ code: 'NEXUS_NOT_VISIBLE' }),
    );
    expect(ship.get(POWER_ROUTER)).toBeDefined();
    expect(ship.get(REACTOR).output).toBe(0);
    expect(ship.get(SHIELD_GRID)).toBeDefined();
  });

  it('fails the check when the router reads the consumers through plain all()', () => {
    /** The router's contract over a plain all(), which the railgun's load reads back. */
    class EagerRouter implements IPowerRouter {
      static deps = [all(POWER_CONSUMERS)] as const;
      constructor(private readonly consumers: IPowerConsumer[]) {}
      loads(ship: ShipSnapshot) {
        return this.consumers.map((consumer) => consumer.draw(ship));
      }
      divert() {}
      register() {
        return () => {};
      }
    }
    const Eager = defineModule({
      name: 'EagerRouterShip',
      imports: [Simulation.forRoot(SHIP_OPTIONS)],
      providers: [
        provide(POWER_ROUTER, { useClass: EagerRouter }),
        provide(WEAPON_MOUNT, { useClass: RailgunMount }),
        provide(POWER_CONSUMERS, { useClass: WeaponsPower }),
      ],
    });
    expect(() => check(Eager)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          expect.objectContaining({
            code: 'NEXUS_CIRCULAR_DEPENDENCY',
            path: [
              'PowerRouter',
              'PowerConsumers',
              'WeaponMount',
              'PowerRouter',
            ],
          }),
        ],
      }),
    );
  });

  it('lists the railgun load of a Weapons that only the kernel and Engineering sit beside', async () => {
    await using ship = await Nexus.create(
      defineModule({
        name: 'Gunship',
        imports: [Simulation.forRoot(SHIP_OPTIONS), Weapons, Engineering],
      }),
    );
    const ids = ship
      .get(POWER_ROUTER)
      .loads(ship.get(SHIP_STATE).snapshot())
      .map(({ id }) => id);
    // all() lists the contributions in the order the walk meets their modules.
    expect(ids).toEqual(['railgun', 'shields']);
  });

  it('leaves the coolant loop out of the package root', () => {
    expect(Object.keys(packageRoot)).toEqual(
      expect.arrayContaining([
        'REACTOR',
        'POWER_ROUTER',
        'SHIELD_GRID',
        'POWER_CONSUMERS',
      ]),
    );
    expect(packageRoot).not.toHaveProperty('COOLANT_LOOP');
  });

  test('raises the shields once the reactor climbs past 200 MW, and sheds them as it falls', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);

    expect(throttle(desk, 1)).toEqual({ tick: 1 });

    // Level 0.16 after 16 ticks: 193.6 MW, under the grid's 200 MW.
    expect(loop.advance(16).reactor.electric).toBeCloseTo(193.6e6, 0);
    expect(() => shields(desk, true)).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_POWER_BUDGET',
        consumer: 'shields',
        demand: 200e6,
      }),
    );

    // Level 0.17 after 17 ticks: 205.7 MW.
    expect(loop.advance(1).reactor.electric).toBeCloseTo(205.7e6, 0);
    expect(shields(desk, true)).toEqual({ tick: 18 });

    const raised = loop.advance(1);
    expect(shieldsLoad(raised)).toEqual({
      id: 'shields',
      priority: 2,
      demand: 200e6,
      allocated: 200e6,
    });
    expect(raised.power.shed).toEqual([]);

    // The level falls 0.18, 0.17, 0.16: the grid sheds at 193.6 MW on tick 20.
    expect(throttle(desk, 0)).toEqual({ tick: 19 });
    expect(loop.advance(1).power.shed).toEqual([]);
    const shed = loop.advance(1);
    expect(shed.tick).toBe(20);
    expect(shed.power.shed).toEqual(['shields']);
    expect(shieldsLoad(shed)).toMatchObject({ allocated: 0 });
    expect(shed.setpoints.shields).toEqual({ raised: true });
  });

  test('applies a raise and a lower queued in one tick as the lower, so the grid draws nothing', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    throttle(desk, 1);
    // Level 0.17 after 17 ticks: 205.7 MW, so the raise passes the divert.
    loop.advance(17);
    expect(shields(desk, true)).toEqual({ tick: 18 });
    expect(shields(desk, false)).toEqual({ tick: 18 });

    const next = loop.advance(1);
    const log = ship.get(SHIP_STATE).log();
    expect(log.filter((entry) => entry.tick === 18)).toStrictEqual([
      { tick: 18, change: { shields: { raised: false } } },
    ]);
    expect(shieldsLoad(next)).toEqual({
      id: 'shields',
      priority: 2,
      demand: 0,
      allocated: 0,
    });
  });

  test('holds the idle ship after 600 ticks: level 0, 500 K and no load', ({
    nexus: ship,
  }) => {
    const idle = ship.get(TICK_LOOP).advance(600);
    expect(idle.reactor.level).toBe(0);
    expect(idle.coolant.temperature).toBe(500);
    expect(idle.power.output).toBe(0);
    expect(idle.power.shed).toEqual([]);
    expect(shieldsLoad(idle)).toEqual({
      id: 'shields',
      priority: 2,
      demand: 0,
      allocated: 0,
    });
  });

  test('scrams the reactor when the ship is disposed', async ({
    nexus: ship,
  }) => {
    const state = ship.get(SHIP_STATE);
    throttle(ship.get(COMMAND_DESK), 1);
    ship.get(TICK_LOOP).advance(30);
    expect(state.snapshot().reactor.level).toBeCloseTo(0.3, 12);
    await ship[Symbol.asyncDispose]();
    expect(state.snapshot().tick).toBe(30);
    expect(state.snapshot().reactor).toMatchObject({ level: 0, electric: 0 });
    expect(state.snapshot().setpoints.reactor).toEqual({ throttle: 0 });
  });
});
