import { Nexus } from '@nexusdi/core';
import { describe, expect, it, vi } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { LITHIUM_LOOP } from '../src/systems/engineering/engineering-model';
import { RAILGUN } from '../src/systems/weapons/weapons-model';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  SHIP_STATE,
  SHIP_SYSTEMS,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { POWER_ROUTER } from '../src/systems/engineering/contracts';
import { FTL_DRIVE } from '../src/systems/ftl/contracts';
import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';
import { WEAPON_MOUNT } from '../src/systems/weapons/contracts';

const options = { seed: 7, dt: 0.5 };

/** 0.0899 K: a quarter of the 300 MJ shot over the loop's heat capacity. */
const PULSE_KELVIN =
  (0.25 * 300e6) / (LITHIUM_LOOP.mass * LITHIUM_LOOP.heatCapacity);

const throttle = (desk: ICommandDesk, level: number) =>
  desk.submit({ system: 'engineering', action: 'throttle', level });
const fire = (desk: ICommandDesk, range: unknown) =>
  desk.submit({ system: 'weapons', action: 'fire', range });

/** The load the router allocated `id` on `ship`. */
const load = (ship: ShipSnapshot, id: string) =>
  ship.power.loads.find((entry) => entry.id === id);

/** The refusal a fire gets with `available` W free. */
const budget = (available: number) =>
  expect.objectContaining({
    code: 'MERIDIAN_POWER_BUDGET',
    consumer: 'railgun',
    demand: 300_000_000,
    available,
  });

/** The offline ship. */
const create = () => Nexus.create(meridianSystems(options));

/** The parts of `ship` a case drives. */
const parts = (ship: Nexus) => ({
  desk: ship.get(COMMAND_DESK),
  loop: ship.get(TICK_LOOP),
  state: ship.get(SHIP_STATE),
});

/** The first shot of `ship` at `range` m: full throttle from tick 0 and a fire after tick 30. */
function firstShot(ship: Nexus, range: number) {
  const { desk, loop } = parts(ship);
  throttle(desk, 1);
  loop.advance(30);
  fire(desk, range);
  return loop.advance(2).weapons.lastShot;
}

describe('the weapons', () => {
  it('checks as part of the ship', async () => {
    expect(() => Nexus.check(meridianSystems(options))).not.toThrow();
    expect(() =>
      Nexus.check(meridianSystems(options), { load: [FtlDrive] }),
    ).not.toThrow();

    await using nexus = await create();
    const { desk, state } = parts(nexus);
    expect(nexus.get(WEAPON_MOUNT).rating).toBe(RAILGUN);
    expect(
      nexus
        .get(SHIP_SYSTEMS)
        .filter(({ name }) => name === 'Weapons')
        .map(({ phase }) => phase),
    ).toEqual([3]);
    expect(() => desk.submit({ system: 'warp', action: 'x' })).toThrow(
      expect.objectContaining({
        reason: 'system',
        expected: 'comms, engineering, helm, life-support, safety and weapons',
      }),
    );
    expect(Object.keys(state.snapshot())).toEqual([
      'tick',
      'time',
      'compartments',
      'reactor',
      'coolant',
      'power',
      'lifeSupport',
      'comms',
      'weapons',
      'drive',
      'helm',
      'ftl',
      'safety',
      'setpoints',
    ]);
  });

  it('starts idle and keeps the record by identity', async () => {
    await using nexus = await create();
    const { loop, state } = parts(nexus);
    const start = state.snapshot();
    expect(start.weapons).toStrictEqual({
      status: 'idle',
      charge: 0,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expect(start.setpoints.weapons).toStrictEqual({
      armed: false,
      range: null,
    });
    expect(Object.isFrozen(start.weapons)).toBe(true);
    expect(Object.isFrozen(start.setpoints.weapons)).toBe(true);
    expect(start.power.loads.map(({ id }) => id)).toEqual([
      'life-support',
      'shields',
      'comms',
      'thrusters',
      'main-drive',
      'railgun',
    ]);
    expect(load(start, 'railgun')).toEqual({
      id: 'railgun',
      priority: 6,
      demand: 0,
      allocated: 0,
    });

    const first = loop.advance(1);
    expect(first.weapons).toBe(start.weapons);
    expect(load(first, 'railgun')).toEqual({
      id: 'railgun',
      priority: 6,
      demand: 0,
      allocated: 0,
    });
  });

  it('refuses a fire on a cold ship and on a ramp, and every bad argument', async () => {
    await using coldShip = await create();
    const cold = parts(coldShip);
    expect(() => fire(cold.desk, 10_000)).toThrow(budget(0));
    for (const range of [
      -1,
      100_001,
      NaN,
      '10000',
      undefined,
      null,
      Infinity,
    ]) {
      expect(() => fire(cold.desk, range)).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
          system: 'weapons',
          action: 'fire',
        }),
      );
    }
    expect(() =>
      cold.desk.submit({ system: 'weapons', action: 'reload' }),
    ).toThrow(expect.objectContaining({ reason: 'action', action: 'reload' }));
    expect(cold.loop.advance(1).setpoints.weapons).toEqual({
      armed: false,
      range: null,
    });
    expect(cold.state.log()).toEqual([]);

    await using rampShip = await create();
    const ramp = parts(rampShip);
    throttle(ramp.desk, 1);
    ramp.loop.advance(24);
    expect(() => fire(ramp.desk, 10_000)).toThrow(budget(290_400_000.00000006));
    expect(ramp.state.log().map(({ tick }) => tick)).toEqual([1]);
  });

  it('flies the golden scenario: charges, hits at tick 32, tops up at 200 MW and misses at tick 41', async () => {
    await using nexus = await create();
    const { desk, loop, state } = parts(nexus);

    expect(throttle(desk, 1)).toEqual({ tick: 1 });
    loop.advance(30);
    expect(fire(desk, 10_000)).toEqual({ tick: 31 });

    const charging = loop.advance(1);
    expect(charging.tick).toBe(31);
    expect(charging.weapons).toEqual({
      status: 'charging',
      charge: 150_000_000,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expect(charging.setpoints.weapons).toEqual({ armed: true, range: 10_000 });
    expect(load(charging, 'railgun')).toMatchObject({
      demand: 300_000_000,
      allocated: 300_000_000,
    });

    const hit = loop.advance(1);
    expect(hit.weapons).toEqual({
      status: 'charging',
      charge: 0,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });
    expect(hit.setpoints.weapons).toEqual({ armed: true, range: null });
    expect(hit.coolant.temperature).toBe(507.6756283905922);

    const full = loop.advance(3);
    expect(full.tick).toBe(35);
    expect(full.weapons).toMatchObject({
      status: 'charged',
      charge: 400_000_000,
    });
    expect(load(full, 'railgun')).toMatchObject({
      demand: 200_000_000,
      allocated: 200_000_000,
    });
    expect(load(loop.advance(1), 'railgun')).toMatchObject({
      demand: 0,
      allocated: 0,
    });

    loop.advance(4);
    expect(fire(desk, 50_000)).toEqual({ tick: 41 });
    const miss = loop.advance(1);
    expect(miss.weapons).toEqual({
      status: 'charging',
      charge: 100_000_000,
      shots: 2,
      hits: 1,
      lastShot: { tick: 41, range: 50_000, hit: false },
    });
    expect(load(miss, 'railgun')?.demand).toBe(0);
    const topping = loop.advance(1);
    expect(topping.weapons.charge).toBe(250_000_000);
    expect(load(topping, 'railgun')?.allocated).toBe(300_000_000);
    expect(loop.advance(1).weapons.status).toBe('charged');
    expect(state.log().map(({ tick }) => tick)).toEqual([1, 31, 41]);

    // The same run with no shot reads the loop 0.0899 K cooler at tick 32.
    await using calmShip = await create();
    const calm = parts(calmShip);
    throttle(calm.desk, 1);
    const unshot = calm.loop.advance(32);
    expect(
      Math.abs(
        hit.coolant.temperature -
          unshot.coolant.temperature -
          0.08992805755394784,
      ),
    ).toBeLessThan(1e-9);
    expect(hit.coolant.temperature - unshot.coolant.temperature).toBeCloseTo(
      PULSE_KELVIN,
      9,
    );
  });

  it('merges two fires in one tick and replaces the range of a waiting shot', async () => {
    await using nexus = await create();
    const { desk, loop, state } = parts(nexus);
    throttle(desk, 1);
    loop.advance(30);
    expect(fire(desk, 10_000)).toEqual({ tick: 31 });
    expect(fire(desk, 20_000)).toEqual({ tick: 31 });
    expect(loop.advance(1).setpoints.weapons).toEqual({
      armed: true,
      range: 20_000,
    });

    const divert = vi.spyOn(nexus.get(POWER_ROUTER), 'divert');
    expect(fire(desk, 30_000)).toEqual({ tick: 32 });
    expect(divert).not.toHaveBeenCalled();
    const shot = loop.advance(1);
    expect(shot.weapons).toMatchObject({
      shots: 1,
      lastShot: { tick: 32, range: 30_000, hit: false },
    });
    expect(state.log()).toEqual([
      { tick: 1, change: { reactor: { throttle: 1 } } },
      { tick: 31, change: { weapons: { armed: true, range: 20_000 } } },
      { tick: 32, change: { weapons: { range: 30_000 } } },
    ]);
  });

  it('holds the capacitor when a full burn sheds it', async () => {
    await using nexus = await create();
    const { desk, loop } = parts(nexus);
    throttle(desk, 0.6);
    loop.advance(60);
    expect(fire(desk, 0)).toEqual({ tick: 61 });
    expect(loop.advance(1).weapons.charge).toBe(150_000_000);
    expect(desk.submit({ system: 'helm', action: 'burn', level: 1 })).toEqual({
      tick: 62,
    });

    const held = loop.advance(1);
    expect(held.tick).toBe(62);
    expect(held.weapons).toEqual({
      status: 'held',
      charge: 150_000_000,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expect(held.setpoints.weapons).toEqual({ armed: true, range: 0 });
    expect(held.power.shed).toEqual(['railgun']);
    expect(held.safety.alarms).toEqual([
      { code: 'LOAD_SHED', subject: 'railgun' },
    ]);
    expect(held.reactor.electric).toBe(726_000_000);
  });

  it('charges beside the ftl spool and sheds the spool at tick 106', async () => {
    await using nexus = await create();
    const { desk, loop } = parts(nexus);
    await nexus.load(FtlDrive);
    const drive = nexus.get(FTL_DRIVE);
    throttle(desk, 1);
    desk.submit({ system: 'life-support', action: 'online' });
    loop.advance(100);
    expect(drive.spool()).toEqual({ tick: 101 });
    loop.advance(1);
    expect(fire(desk, 10_000)).toEqual({ tick: 102 });

    const charges: number[] = [];
    for (let tick = 102; tick <= 105; tick++) {
      const ship = loop.advance(1);
      expect(load(ship, 'ftl-spool')?.allocated).toBe(900_000_000);
      expect(load(ship, 'railgun')?.allocated).toBe(300_000_000);
      expect(ship.power.shed).toEqual([]);
      charges.push(ship.weapons.charge);
      if (tick === 103) {
        expect(ship.weapons.lastShot).toEqual({
          tick: 103,
          range: 10_000,
          hit: true,
        });
      }
    }
    expect(charges).toEqual([150e6, 0, 150e6, 300e6]);

    desk.submit({ system: 'engineering', action: 'shields', raised: true });
    const shed = loop.advance(1);
    expect(shed.tick).toBe(106);
    expect(shed.power.shed).toEqual(['ftl-spool']);
    expect(load(shed, 'ftl-spool')?.allocated).toBe(0);
    expect(load(shed, 'railgun')).toMatchObject({
      demand: 200_000_000,
      allocated: 200_000_000,
    });
    expect(shed.weapons.status).toBe('charged');

    expect(fire(desk, 10_000)).toEqual({ tick: 107 });
    const shot = loop.advance(1);
    expect(shot.weapons).toMatchObject({
      charge: 100_000_000,
      shots: 2,
      hits: 1,
      lastShot: { tick: 107, range: 10_000, hit: false },
    });
    expect(load(shot, 'railgun')?.allocated).toBe(0);
    expect(load(shot, 'ftl-spool')?.allocated).toBe(900_000_000);
    expect(shot.power.shed).toEqual([]);

    const again = loop.advance(1);
    expect(again.power.shed).toEqual(['ftl-spool']);
    expect(again.safety.alarms).toContainEqual({
      code: 'LOAD_SHED',
      subject: 'ftl-spool',
    });
    expect(load(again, 'railgun')?.allocated).toBe(300_000_000);
  });

  it('hits at 16,279 m and misses at 16,280 m on the first draw', async () => {
    await using near = await create();
    expect(firstShot(near, 16_279)).toEqual({
      tick: 32,
      range: 16_279,
      hit: true,
    });

    await using far = await create();
    expect(firstShot(far, 16_280)).toEqual({
      tick: 32,
      range: 16_280,
      hit: false,
    });
  });
});
