import { Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import * as packageRoot from '../src/index';
import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import {
  COOLANT_LOOP,
  POWER_ROUTER,
  REACTOR,
  SHIELD_GRID,
} from '../src/systems/engineering/contracts';

const options = { seed: 7, dt: 0.5 };

const throttle = (desk: ICommandDesk, level: number) =>
  desk.submit({ system: 'engineering', action: 'throttle', level });
const shields = (desk: ICommandDesk, raised: boolean) =>
  desk.submit({ system: 'engineering', action: 'shields', raised });
/** The shields' record among the tick's loads, which other systems join. */
const shieldsLoad = (ship: ShipSnapshot) =>
  ship.power.loads.find((load) => load.id === 'shields');

describe('Engineering', () => {
  it('passes the check', () => {
    expect(() => Nexus.check(meridianSystems(options))).not.toThrow();
  });

  it('shows its panel to the root and keeps its pipes', async () => {
    await using ship = await Nexus.create(meridianSystems(options));
    expect(() => ship.get(COOLANT_LOOP)).toThrow(
      expect.objectContaining({ code: 'NEXUS_NOT_VISIBLE' }),
    );
    expect(ship.get(POWER_ROUTER)).toBeDefined();
    expect(ship.get(REACTOR).output).toBe(0);
    expect(ship.get(SHIELD_GRID)).toBeDefined();
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

  it('raises the shields once the reactor climbs past 200 MW, and sheds them as it falls', async () => {
    await using ship = await Nexus.create(meridianSystems(options));
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

  it('applies a raise and a lower queued in one tick as the lower, so the grid draws nothing', async () => {
    await using ship = await Nexus.create(meridianSystems(options));
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

  it('holds the idle ship after 600 ticks: level 0, 500 K and no load', async () => {
    await using ship = await Nexus.create(meridianSystems(options));
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

  it('scrams the reactor when the ship is disposed', async () => {
    const ship = await Nexus.create(meridianSystems(options));
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
