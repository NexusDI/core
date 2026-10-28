import { Nexus } from '@nexusdi/core';
import { describe, expect, vi } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { LITHIUM_LOOP } from '../src/systems/engineering/engineering-model';
import { COMMAND_DESK } from '../src/simulation/commands';
import {
  SHIP_STATE,
  SHIP_SYSTEMS,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { POWER_ROUTER } from '../src/systems/engineering/contracts';
import { FTL_DRIVE } from '../src/systems/ftl/contracts';
import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';

import { shipTest } from './fixtures';
import { loadOf, SHIP_OPTIONS, throttle } from './support';

const test = shipTest(meridianSystems(SHIP_OPTIONS));

/** 10.7914 K: a tenth of the 90 GJ charge over the loop's heat capacity. */
const PULSE_KELVIN =
  (0.1 * 90e9) / (LITHIUM_LOOP.mass * LITHIUM_LOOP.heatCapacity);

/** The spool's load on `ship`. */
const spoolLoad = (ship: ShipSnapshot) => loadOf(ship, 'ftl-spool');

/** The refusal a spool gets with `available` W free. */
const budget = (available: number) =>
  expect.objectContaining({
    code: 'MERIDIAN_POWER_BUDGET',
    consumer: 'ftl-spool',
    demand: 900_000_000,
    available,
  });

/** The refusal a jump gets below a full charge holding `charge` J. */
const notSpooled = (charge: number) =>
  expect.objectContaining({
    code: 'MERIDIAN_FTL_NOT_SPOOLED',
    charge,
    energy: 90_000_000_000,
  });

/** The offline ship with the FTL drive loaded, and the parts a case drives. */
async function loaded(ship: Nexus) {
  await ship.load(FtlDrive);
  return {
    desk: ship.get(COMMAND_DESK),
    loop: ship.get(TICK_LOOP),
    state: ship.get(SHIP_STATE),
    drive: ship.get(FTL_DRIVE),
  };
}

describe('the FTL drive', () => {
  test('checks as a load and fails alone', () => {
    expect(() =>
      Nexus.check(meridianSystems(SHIP_OPTIONS), { load: [FtlDrive] }),
    ).not.toThrow();
    expect(() => Nexus.check(FtlDrive)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: ['TickLoop', 'ShipState', 'NavCharts', 'PowerRouter'].map(
          (token) =>
            expect.objectContaining({ code: 'NEXUS_MISSING_PROVIDER', token }),
        ),
      }),
    );
  });

  test('loads once, attaches a load at 0 W and keeps the desk list', async ({
    nexus: ship,
  }) => {
    const loop = ship.get(TICK_LOOP);
    expect(ship.has(FTL_DRIVE)).toBe(false);

    const first = loop.advance(1);
    expect(first.power.loads.map(({ id }) => id)).toEqual([
      'life-support',
      'shields',
      'comms',
      'thrusters',
      'main-drive',
      'railgun',
    ]);
    expect(first.ftl).toEqual({
      status: 'offline',
      charge: 0,
      sector: 'Sol',
      jumped: null,
    });

    // Two loads at once build one drive: a second JumpDrive would attach a
    // second system named FtlDrive, which the loop refuses.
    await expect(
      Promise.all([ship.load(FtlDrive), ship.load(FtlDrive)]),
    ).resolves.toEqual([undefined, undefined]);

    const second = loop.advance(1);
    expect(second.ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'Sol',
      jumped: null,
    });
    expect(second.ftl).not.toBe(first.ftl);
    expect(second.power.loads.map(({ id }) => id)).toEqual([
      'life-support',
      'shields',
      'comms',
      'thrusters',
      'main-drive',
      'railgun',
      'ftl-spool',
    ]);
    expect(spoolLoad(second)).toEqual({
      id: 'ftl-spool',
      priority: 7,
      demand: 0,
      allocated: 0,
    });
    expect(loop.advance(1).ftl).toBe(second.ftl);

    expect(ship.get(SHIP_SYSTEMS).map(({ name }) => name)).not.toContain(
      'FtlDrive',
    );
    expect(() =>
      ship.get(COMMAND_DESK).submit({ system: 'ftl', action: 'spool' }),
    ).toThrow(
      expect.objectContaining({
        reason: 'system',
        expected: 'comms, engineering, helm, life-support, safety and weapons',
      }),
    );
    expect(() =>
      loop.attach({ name: 'FtlDrive', phase: 3, step: (ship) => ship }),
    ).toThrow("Two ship systems are named 'FtlDrive'.");
  });

  test('detaches the loop when the router attach throws, and loads on a retry', async ({
    nexus: ship,
  }) => {
    const loop = ship.get(TICK_LOOP);
    vi.spyOn(ship.get(POWER_ROUTER), 'attach').mockImplementationOnce(() => {
      throw new Error('The router is down.');
    });

    await expect(ship.load(FtlDrive)).rejects.toThrow(
      expect.objectContaining({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: expect.objectContaining({ message: 'The router is down.' }),
      }),
    );
    expect(ship.has(FTL_DRIVE)).toBe(false);
    // The loop holds its six built-in systems again, so the name is free.
    loop.attach({ name: 'FtlDrive', phase: 3, step: (ship) => ship })();
    expect(loop.advance(1).ftl.status).toBe('offline');

    await ship.load(FtlDrive);
    const loaded = loop.advance(1);
    expect(loaded.ftl.status).toBe('idle');
    expect(loaded.power.loads.map(({ id }) => id)).toContain('ftl-spool');
  });

  test('refuses a spool on a cold reactor and holds it until the reactor reaches 0.9', async ({
    nexus: ship,
  }) => {
    const { desk, loop, state, drive } = await loaded(ship);

    expect(() => drive.spool()).toThrow(budget(0));
    expect(throttle(desk, 1)).toEqual({ tick: 1 });
    loop.advance(74);
    expect(() => drive.spool()).toThrow(budget(895_400_000.0000005));
    loop.advance(1);
    expect(drive.spool()).toEqual({ tick: 76 });

    for (let tick = 76; tick <= 90; tick++) {
      const ship = loop.advance(1);
      expect(ship.tick).toBe(tick);
      expect(ship.ftl.status).toBe('held');
      expect(spoolLoad(ship)).toMatchObject({ demand: 0, allocated: 0 });
      expect(ship.safety.alarms).toEqual([]);
    }
    const spooling = loop.advance(1);
    expect(spooling.tick).toBe(91);
    expect(spooling.ftl).toEqual({
      status: 'spooling',
      charge: 450_000_000,
      sector: 'Sol',
      jumped: null,
    });
    expect(spoolLoad(spooling)).toMatchObject({
      demand: 900_000_000,
      allocated: 900_000_000,
    });
    expect(state.log().map(({ tick }) => tick)).toEqual([1, 76]);
  });

  test('flies the golden scenario: spools from tick 101, charges to tick 300, jumps at tick 301', async ({
    nexus: ship,
  }) => {
    const { desk, loop, state, drive } = await loaded(ship);

    throttle(desk, 1);
    loop.advance(100);
    expect(drive.spool()).toEqual({ tick: 101 });
    expect(() => drive.jump('Kepler-442b')).toThrow(notSpooled(0));
    const spooled = loop.advance(1);
    expect(spooled.ftl).toEqual({
      status: 'spooling',
      charge: 450_000_000,
      sector: 'Sol',
      jumped: null,
    });
    expect(spoolLoad(spooled)?.allocated).toBe(900_000_000);

    loop.advance(49);
    expect(() => drive.jump('Kepler-442b')).toThrow(notSpooled(22_500_000_000));
    loop.advance(50);
    // A spool on an armed drive asks the router nothing and queues nothing.
    expect(drive.spool()).toEqual({ tick: 201 });
    expect(state.log().map(({ tick }) => tick)).toEqual([1, 101]);

    expect(loop.advance(99).ftl.charge).toBe(89_550_000_000);
    const full = loop.advance(1);
    expect(full.tick).toBe(300);
    expect(full.ftl).toEqual({
      status: 'charged',
      charge: 90_000_000_000,
      sector: 'Sol',
      jumped: null,
    });
    for (const to of ['Vega', 'constructor']) {
      expect(() => drive.jump(to)).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
        }),
      );
    }
    expect(drive.jump('Kepler-442b')).toEqual({ tick: 301 });

    const jumped = loop.advance(1);
    expect(jumped.ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'Kepler-442b',
      jumped: 301,
    });
    expect(jumped.setpoints.ftl).toEqual({ armed: false, jump: null });
    expect(spoolLoad(jumped)).toMatchObject({ demand: 0, allocated: 0 });
    expect(jumped.coolant.temperature).toBe(844.442961811425);
    expect(state.log().map(({ tick }) => tick)).toEqual([1, 101, 301]);

    loop.advance(1);
    expect(drive.spool()).toEqual({ tick: 303 });
    loop.advance(200);
    expect(drive.jump('TRAPPIST-1e')).toEqual({ tick: 503 });
    expect(loop.advance(1).ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'TRAPPIST-1e',
      jumped: 503,
    });

    // The same run with no jump reads the loop 10.7914 K cooler at tick 301.
    await using calm = await Nexus.create(meridianSystems(SHIP_OPTIONS));
    const still = await loaded(calm);
    throttle(still.desk, 1);
    still.loop.advance(100);
    still.drive.spool();
    const unjumped = still.loop.advance(201);
    expect(unjumped.coolant.temperature).toBe(833.6515949049501);
    expect(
      Math.abs(
        jumped.coolant.temperature -
          unjumped.coolant.temperature -
          PULSE_KELVIN,
      ),
    ).toBeLessThan(1e-9);
  });

  test('sheds the spool beside the raised shields at tick 120', async ({
    nexus: ship,
  }) => {
    const { desk, loop, drive } = await loaded(ship);

    throttle(desk, 1);
    loop.advance(100);
    drive.spool();
    loop.advance(10);
    desk.submit({ system: 'engineering', action: 'shields', raised: true });
    throttle(desk, 0.9);
    const shed = loop.advance(10);
    expect(shed.tick).toBe(120);
    expect(shed.ftl).toEqual({
      status: 'held',
      charge: 8_550_000_000,
      sector: 'Sol',
      jumped: null,
    });
    expect(shed.power.shed).toEqual(['ftl-spool']);
    expect(shed.safety.alarms).toEqual([
      { code: 'LOAD_SHED', subject: 'ftl-spool' },
    ]);
  });

  test('refuses a spool on a cold ship with 12.1 MW free', async ({
    nexus: ship,
  }) => {
    const { desk, loop, drive } = await loaded(ship);

    throttle(desk, 0.01);
    desk.submit({ system: 'life-support', action: 'online' });
    loop.advance(600);
    expect(() => drive.spool()).toThrow(budget(12_093_132.552581994));
  });

  test('extends a scope opened before the load', async ({ nexus: ship }) => {
    // A request's scope, as an adapter opens one before the handler runs.
    await using scope = await ship.createScope({ request: {} });
    await ship.load(FtlDrive);

    expect(() => scope.get(FTL_DRIVE)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_LOADED_AFTER_SCOPE',
        token: 'FtlDrive',
        module: 'FtlDrive',
      }),
    );
    await scope.extend();
    expect(scope.get(FTL_DRIVE)).toBe(ship.get(FTL_DRIVE));
  });
});
