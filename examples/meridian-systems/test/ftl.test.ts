import { defineModule, Nexus, provide } from '@nexusdi/core';
import { describe, expect, vi } from 'vitest';

import { Engineering } from '../src/systems/engineering/engineering.module';
import { Tactical } from '../src/systems/tactical/tactical.module';
import { LITHIUM_LOOP } from '../src/systems/engineering/engineering-model';
import {
  COMMAND_DESK,
  COMMAND_HANDLERS,
  type ICommandHandler,
  type QueuedCommand,
} from '../src/simulation/commands';
import {
  SHIP_RECORDS,
  SHIP_STATE,
  SHIP_SYSTEMS,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import {
  POWER_CONSUMERS,
  POWER_ROUTER,
} from '../src/systems/engineering/contracts';
import {
  FTL_COMMANDS,
  FTL_DRIVE,
  FTL_PHYSICS,
  FTL_POWER,
  type IFtlDrive,
} from '../src/systems/ftl/contracts';
import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';
import { FtlPhysics } from '../src/systems/ftl/ftl-physics';
import { FtlPower } from '../src/systems/ftl/ftl-power';
import { JumpDrive } from '../src/systems/ftl/jump-drive';

import { shipRoot } from './ship-root';
import { shipTest } from './fixtures';
import { loadOf, throttle } from './support';

/** The system modules whose tokens these cases read from the root. */
const READS = [Engineering];
const test = shipTest(shipRoot({ reads: READS }));

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
      Nexus.check(shipRoot({ reads: READS }), { load: [FtlDrive] }),
    ).not.toThrow();
    // FtlDrive imports Engineering and Tactical, and alone it lacks the
    // kernel that Simulation gives a ship.
    expect(() => Nexus.check(FtlDrive)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: expect.arrayContaining(
          ['TickLoop', 'ShipState', 'CommandDesk'].map((token) =>
            expect.objectContaining({
              code: 'NEXUS_MISSING_PROVIDER',
              token,
              module: 'FtlDrive',
            }),
          ),
        ),
      }),
    );
  });

  test('loads once and registers a load at 0 W', async ({ nexus: ship }) => {
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

    // Two loads at once build one drive: a second JumpDrive would register a
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

    expect(() =>
      loop.register({ name: 'FtlDrive', phase: 3, step: (ship) => ship }),
    ).toThrow("Two ship systems are named 'FtlDrive'.");
  });

  test('adds no contribution to a multi token, and the buses hold the drive until dispose', async () => {
    const ship = await Nexus.create(shipRoot({ reads: READS }));
    const contributions = () => ({
      systems: ship.get(SHIP_SYSTEMS),
      handlers: ship.get(COMMAND_HANDLERS),
      consumers: ship.get(POWER_CONSUMERS),
      records: ship.get(SHIP_RECORDS),
    });
    const desk = ship.get(COMMAND_DESK);
    const spool = () => desk.submit({ system: 'ftl', action: 'spool' });
    const before = contributions();
    expect(spool).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'system',
        system: 'ftl',
      }),
    );

    await ship.load(FtlDrive);
    expect(contributions()).toEqual(before);
    expect(ship.get(SHIP_STATE).snapshot().ftl).toEqual(
      expect.objectContaining({ status: 'offline' }),
    );
    // The desk hands the spool to the drive, and the cold reactor refuses it.
    expect(spool).toThrow(budget(0));
    expect(
      ship.get(POWER_ROUTER).loads(ship.get(SHIP_STATE).snapshot()),
    ).toContainEqual(expect.objectContaining({ id: 'ftl-spool' }));

    const router = ship.get(POWER_ROUTER);
    const loop = ship.get(TICK_LOOP);
    const ships = ship.get(SHIP_STATE);
    await ship[Symbol.asyncDispose]();
    expect(spool).toThrow(
      expect.objectContaining({ reason: 'system', system: 'ftl' }),
    );
    expect(router.loads(ships.snapshot()).map(({ id }) => id)).not.toContain(
      'ftl-spool',
    );
    expect(ships.snapshot()).not.toHaveProperty('ftl');
    expect(ships.snapshot().setpoints).not.toHaveProperty('ftl');
    expect(() =>
      loop.register({ name: 'FtlDrive', phase: 3, step: (ship) => ship }),
    ).not.toThrow();
  });

  test('refuses a drive that publishes a contribution at load', async ({
    nexus: ship,
  }) => {
    const Publishing = defineModule({
      name: 'PublishingFtlDrive',
      providers: [provide(SHIP_SYSTEMS, { useClass: FtlPhysics })],
      exports: [SHIP_SYSTEMS],
    });
    await expect(ship.load(Publishing)).rejects.toThrow(
      expect.objectContaining({
        code: 'NEXUS_LOAD_CONTRIBUTION',
        module: 'PublishingFtlDrive',
        token: 'ShipSystems',
      }),
    );
  });

  test('needs lazy() in the commands, since the drive reads them to register them', () => {
    class EagerFtlCommands implements ICommandHandler {
      static deps = [FTL_DRIVE] as const;
      readonly system = 'ftl';
      constructor(private readonly drive: IFtlDrive) {}
      handle(): QueuedCommand {
        return this.drive.spool();
      }
    }
    const Eager = defineModule({
      name: 'EagerFtlDrive',
      imports: [Engineering, Tactical],
      providers: [
        provide(FTL_DRIVE, { useClass: JumpDrive }),
        provide(FTL_PHYSICS, { useClass: FtlPhysics }),
        provide(FTL_POWER, { useClass: FtlPower }),
        provide(FTL_COMMANDS, { useClass: EagerFtlCommands }),
      ],
      exports: [FTL_DRIVE],
    });
    expect(() =>
      Nexus.check(shipRoot({ reads: READS }), { load: [Eager] }),
    ).toThrow(
      expect.objectContaining({
        errors: [
          expect.objectContaining({ code: 'NEXUS_CIRCULAR_DEPENDENCY' }),
        ],
      }),
    );
  });

  test('unregisters the loop when the router register throws, and loads on a retry', async ({
    nexus: ship,
  }) => {
    const loop = ship.get(TICK_LOOP);
    vi.spyOn(ship.get(POWER_ROUTER), 'register').mockImplementationOnce(() => {
      throw new Error('The router is down.');
    });

    await expect(ship.load(FtlDrive)).rejects.toThrow(
      expect.objectContaining({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: expect.objectContaining({ message: 'The router is down.' }),
      }),
    );
    expect(ship.has(FTL_DRIVE)).toBe(false);
    // The loop holds its six built-in systems again, so the name is free,
    // and the ship holds no FTL record.
    loop.register({ name: 'FtlDrive', phase: 3, step: (ship) => ship })();
    expect(loop.advance(1)).not.toHaveProperty('ftl');

    await ship.load(FtlDrive);
    const loaded = loop.advance(1);
    expect(loaded.ftl?.status).toBe('idle');
    expect(loaded.power.loads.map(({ id }) => id)).toContain('ftl-spool');
  });

  test('unregisters the loop and the router when the desk register throws', async ({
    nexus: ship,
  }) => {
    const loop = ship.get(TICK_LOOP);
    const router = ship.get(POWER_ROUTER);
    vi.spyOn(ship.get(COMMAND_DESK), 'register').mockImplementationOnce(() => {
      throw new Error('The desk is down.');
    });

    await expect(ship.load(FtlDrive)).rejects.toThrow(
      expect.objectContaining({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: expect.objectContaining({ message: 'The desk is down.' }),
      }),
    );
    expect(
      router.loads(ship.get(SHIP_STATE).snapshot()).map(({ id }) => id),
    ).not.toContain('ftl-spool');
    loop.register({ name: 'FtlDrive', phase: 3, step: (ship) => ship })();
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
      expect(ship.ftl?.status).toBe('held');
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

    expect(loop.advance(99).ftl?.charge).toBe(89_550_000_000);
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
    await using calm = await Nexus.create(shipRoot({ reads: READS }));
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
