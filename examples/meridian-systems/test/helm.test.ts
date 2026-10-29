import { Nexus } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { toRadians, wrap } from '../src/systems/helm/helm-model';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import { SHIP_STATE, TICK_LOOP } from '../src/simulation/contracts';
import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';
import { HELM, HELM_ACTIONS, THRUSTERS } from '../src/systems/helm/contracts';
import { MAIN_DRIVE } from '../src/systems/propulsion/contracts';
import { BUNDLED_CHARTS } from '../src/systems/tactical/star-charts';

import { shipTest } from './fixtures';
import { loadOf, RELAY_URL, SHIP_OPTIONS, throttle } from './support';

const test = shipTest(meridianSystems(SHIP_OPTIONS));

const KEPLER = 0.7330382858376184;

const course = (desk: ICommandDesk, to: unknown) =>
  desk.submit({ system: 'helm', action: 'course', to });
const burn = (desk: ICommandDesk, level: unknown) =>
  desk.submit({ system: 'helm', action: 'burn', level });

/** The relay graph, which downloads its charts at build. */
const relayGraph = () =>
  meridianSystems({ ...SHIP_OPTIONS, relayUrl: RELAY_URL });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the helm and the drive', () => {
  test('builds with the helm and the drive and lists helm on the desk', async ({
    nexus: ship,
  }) => {
    expect(() => Nexus.check(meridianSystems(SHIP_OPTIONS))).not.toThrow();
    expect(() => Nexus.check(relayGraph())).not.toThrow();

    expect(ship.get(HELM)).toBeDefined();
    expect(ship.get(THRUSTERS)).toBeDefined();
    expect(ship.get(MAIN_DRIVE)).toBeDefined();
    expect(() =>
      ship.get(COMMAND_DESK).submit({ system: 'warp-core', action: 'engage' }),
    ).toThrow(
      expect.objectContaining({
        reason: 'system',
        expected: 'comms, engineering, helm, life-support, safety and weapons',
      }),
    );
    await ship.load(FtlDrive);
    expect(() =>
      ship.get(COMMAND_DESK).submit({ system: 'warp-core', action: 'engage' }),
    ).toThrow(
      expect.objectContaining({
        reason: 'system',
        expected:
          'comms, engineering, ftl, helm, life-support, safety and weapons',
      }),
    );
  });

  test('flies the golden scenario: sheds at tick 1, burns off axis at tick 50, settles at tick 688', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);

    expect(throttle(desk, 0.6)).toEqual({ tick: 1 });
    expect(course(desk, 'Kepler-442b')).toEqual({ tick: 1 });
    expect(burn(desk, 1)).toEqual({ tick: 1 });

    // The reactor at 0.01 gives 12.1 MW, under the thrusters' 20 MW.
    const first = loop.advance(1);
    expect(loadOf(first, 'thrusters')).toEqual({
      id: 'thrusters',
      priority: 4,
      demand: 20_000_000,
      allocated: 0,
    });
    expect(loadOf(first, 'main-drive')).toEqual({
      id: 'main-drive',
      priority: 5,
      demand: 600_000_000,
      allocated: 0,
    });
    expect(first.power.shed).toEqual(['thrusters', 'main-drive']);
    expect(first.safety.alarms).toEqual([
      { code: 'LOAD_SHED', subject: 'thrusters' },
      { code: 'LOAD_SHED', subject: 'main-drive' },
    ]);
    expect(first.helm).toEqual({ attitude: 0, rate: 0, torque: 0 });
    expect(first.setpoints.helm.heading).toBe(KEPLER);

    const second = loop.advance(1);
    expect(second.helm).toEqual({
      attitude: 0.0003787878787878788,
      rate: 0.0007575757575757576,
      torque: 5_000_000,
    });
    expect(loadOf(second, 'thrusters')?.allocated).toBe(20_000_000);
    expect(second.power.shed).toEqual(['main-drive']);

    for (let tick = 3; tick < 50; tick++) {
      expect(loop.advance(1).power.shed).toEqual(['main-drive']);
    }

    // The drive pushes along the attitude at the start of the tick, off the
    // course while the helm turns.
    const burning = loop.advance(1);
    expect(burning.tick).toBe(50);
    expect(burning.reactor.electric).toBeCloseTo(605e6, 0);
    expect(loadOf(burning, 'main-drive')?.allocated).toBe(600_000_000);
    expect(burning.drive.thrust).toBe(14_400);
    expect(burning.drive.acceleration).toBeCloseTo(0.003188247, 6);
    expect(burning.power.shed).toEqual([]);
    expect(burning.safety.alarms).toEqual([]);

    let within: number | undefined;
    let settled: number | undefined;
    let last = burning;
    while (last.tick < 1200) {
      last = loop.advance(1);
      const error = Math.abs(
        wrap(last.setpoints.helm.heading - last.helm.attitude),
      );
      if (within === undefined && error < Math.PI / 180) within = last.tick;
      const still =
        last.helm.attitude === KEPLER &&
        last.helm.rate === 0 &&
        last.helm.torque === 0;
      if (settled === undefined && still) settled = last.tick;
      if (settled !== undefined) {
        expect(still).toBe(true);
        expect(loadOf(last, 'thrusters')?.demand).toBe(0);
      }
      expect(last.coolant.temperature).toBeLessThan(1350);
    }
    expect(within).toBe(229);
    expect(settled).toBe(688);
    expect(last.drive.velocity).toBeCloseTo(2.0652, 4);
    expect(last.drive.distance).toBeCloseTo(592.9804, 4);
    expect(
      ship
        .get(SHIP_STATE)
        .log()
        .map(({ tick }) => tick),
    ).toEqual([1]);
  });

  test('burns along the settled course from tick 801', ({ nexus: ship }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);

    expect(throttle(desk, 0.6)).toEqual({ tick: 1 });
    loop.advance(10);
    expect(course(desk, 'Kepler-442b')).toEqual({ tick: 11 });

    let settled: number | undefined;
    let ready = loop.advance(1);
    while (ready.tick < 800) {
      ready = loop.advance(1);
      const still =
        ready.helm.attitude === KEPLER &&
        ready.helm.rate === 0 &&
        ready.helm.torque === 0;
      if (settled === undefined && still) settled = ready.tick;
    }
    expect(settled).toBe(697);
    expect(ready.helm).toEqual({ attitude: KEPLER, rate: 0, torque: 0 });
    expect(loadOf(ready, 'thrusters')?.demand).toBe(0);
    expect(loadOf(ready, 'main-drive')?.demand).toBe(0);

    expect(burn(desk, 1)).toEqual({ tick: 801 });
    const end = loop.advance(400);
    expect(end.drive.thrust).toBe(14_400);
    expect(end.drive.massFlow).toBeCloseTo(0.288, 12);
    expect(end.drive.acceleration).toBeCloseTo(0.0036, 12);
    expect(end.drive.velocity).toBeCloseTo(0.72, 12);
    expect(end.drive.distance).toBeCloseTo(72.18, 12);
    expect(loadOf(end, 'main-drive')?.allocated).toBe(600_000_000);
    expect(end.safety.alarms).toEqual([]);
    expect(
      ship
        .get(SHIP_STATE)
        .log()
        .map(({ tick }) => tick),
    ).toEqual([1, 11, 801]);
  });

  test('refuses the shields at tick 16 with 193,600,000 W available', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    const shields = () =>
      desk.submit({ system: 'engineering', action: 'shields', raised: true });

    throttle(desk, 1);
    burn(desk, 1);
    course(desk, 'Proxima-b');
    loop.advance(16);
    expect(shields).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_POWER_BUDGET',
        consumer: 'shields',
        demand: 200_000_000,
        available: 193_600_000,
      }),
    );
    loop.advance(1);
    expect(shields()).toEqual({ tick: 18 });
  });

  test('refuses helm warp, a burn of 2 and a course to 42', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);

    expect(() => desk.submit({ system: 'helm', action: 'warp' })).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'action',
        expected: HELM_ACTIONS,
      }),
    );
    for (const refused of [() => burn(desk, 2), () => course(desk, 42)]) {
      expect(refused).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
          expected: HELM_ACTIONS,
        }),
      );
    }
    expect(ship.get(SHIP_STATE).log()).toEqual([]);
  });

  test('refuses a course to Vega, constructor and __proto__, which the charts do not hold', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);

    for (const to of ['Vega', 'constructor', '__proto__']) {
      expect(() => course(desk, to)).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
          system: 'helm',
          action: 'course',
          expected: HELM_ACTIONS,
        }),
      );
    }
    expect(ship.get(SHIP_STATE).log()).toEqual([]);
  });

  it("steers the charted heading offline and from the relay's table", async () => {
    await using offline = await Nexus.create(meridianSystems(SHIP_OPTIONS));
    expect(course(offline.get(COMMAND_DESK), 'TRAPPIST-1e')).toEqual({
      tick: 1,
    });
    expect(offline.get(TICK_LOOP).advance(1).setpoints.helm.heading).toBe(
      -2.7401669256310974,
    );

    // The relay's table differs from the bundled one, so the heading shows
    // which table the helm plotted on.
    const fetched: string[] = [];
    vi.stubGlobal('fetch', (url: URL | string) => {
      fetched.push(String(url));
      return Promise.resolve(
        Response.json({ ...BUNDLED_CHARTS, 'Kepler-442b': 90 }),
      );
    });
    await using linked = await Nexus.create(relayGraph());
    expect(fetched).toHaveLength(1);
    course(linked.get(COMMAND_DESK), 'Kepler-442b');
    expect(linked.get(TICK_LOOP).advance(1).setpoints.helm.heading).toBe(
      toRadians(90),
    );
    expect(fetched).toHaveLength(1);
  });
});
