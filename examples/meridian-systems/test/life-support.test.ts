import { Nexus } from '@nexusdi/core';
import { describe, expect } from 'vitest';

import { ShipLifeSupport } from '../src/systems/life-support/life-support.module';
import { UnknownCompartmentError } from '../src/errors';
import { OFF_GASSING } from '../src/systems/life-support/life-support-model';
import { pressure, totalMoles } from '../src/physics/gas';
import { COMMAND_DESK } from '../src/simulation/commands';
import {
  type CompartmentId,
  DECK_PLAN,
  type DeckPlan,
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import {
  ATMOSPHERE_CONTROL,
  ATMOSPHERE_PROBE,
  ATMOSPHERE_SENSOR,
} from '../src/systems/life-support/contracts';

import { shipRoot } from './ship-root';
import { shipTest } from './fixtures';
import { loadOf, online, throttle } from './support';

/** The system modules whose tokens these cases read from the root. */
const READS = [ShipLifeSupport];
const test = shipTest(shipRoot({ reads: READS }));

const lifeSupportLoad = (ship: ShipSnapshot) => loadOf(ship, 'life-support');

function roomPressure(ship: ShipSnapshot, deck: DeckPlan, id: CompartmentId) {
  const room = deck.compartments.find((entry) => entry.id === id);
  if (!room) throw new Error(`the deck has no ${id}`);
  const air = ship.compartments[id];
  return pressure(totalMoles(air.moles), air.temperature, room.volume);
}

describe('LifeSupport', () => {
  test('passes the check', () => {
    expect(() => Nexus.check(shipRoot({ reads: READS }))).not.toThrow();
  });

  test('shows the root its sensor in a scope and its panel', async ({
    nexus: ship,
  }) => {
    expect(ship.get(ATMOSPHERE_CONTROL)).toBeDefined();
    await using scope = await ship.createScope({
      request: { compartment: 'habitat' },
    });
    expect(scope.get(ATMOSPHERE_SENSOR).read()).toMatchObject({
      compartment: 'habitat',
      tick: 0,
    });
  });

  test('shows the root the probe its analyzers read through', async ({
    nexus: ship,
  }) => {
    const loop = ship.get(TICK_LOOP);
    loop.advance(3);
    const air = ship.get(SHIP_STATE).snapshot().compartments.bridge;
    await using scope = await ship.createScope({
      request: { compartment: 'bridge' },
    });
    expect(ship.get(ATMOSPHERE_PROBE).read('bridge', air, 3)).toEqual(
      scope.get(ATMOSPHERE_SENSOR).read(),
    );
  });

  test('refuses a sensor for a compartment the deck lacks', async ({
    nexus: ship,
  }) => {
    await using scope = await ship.createScope({
      request: { compartment: 'galley' },
    });
    // Core rethrows a NexusError from a sync construct as it is.
    expect(() => scope.get(ATMOSPHERE_SENSOR)).toThrow(UnknownCompartmentError);
  });

  test('builds a new analyzer on each get, so two gets around a tick read two ticks', async ({
    nexus: ship,
  }) => {
    await using scope = await ship.createScope({
      request: { compartment: 'airlock' },
    });
    const first = scope.get(ATMOSPHERE_SENSOR);
    ship.get(TICK_LOOP).advance(1);
    const second = scope.get(ATMOSPHERE_SENSOR);
    expect(first.read().tick).toBe(0);
    expect(second.read().tick).toBe(1);
    expect(first.read().tick).toBe(0);
  });

  test('sheds life support at throttle 0, since the cold reactor gives no power', ({
    nexus: ship,
  }) => {
    online(ship.get(COMMAND_DESK));
    const next = ship.get(TICK_LOOP).advance(1);
    expect(next.setpoints.lifeSupport.online).toBe(true);
    expect(next.power.shed).toEqual(['life-support']);
    expect(lifeSupportLoad(next)).toMatchObject({ allocated: 0 });
    expect(next.lifeSupport.heaters).toEqual({ bridge: 0, habitat: 0 });
  });

  test('pumps the airlock down and holds it once the pump stalls', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    const deck = ship.get(DECK_PLAN);
    throttle(desk, 0.01);
    online(desk);
    desk.submit({
      system: 'life-support',
      action: 'pump',
      compartment: 'airlock',
      mode: 'evacuate',
    });

    const pumped = loop.advance(120);
    expect(pumped.tick).toBe(120);
    const airlock = roomPressure(pumped, deck, 'airlock');
    expect(airlock).toBeGreaterThan(36_900);
    expect(airlock).toBeLessThan(37_300);

    // Run until the start-of-tick rise reaches the pump's 101,300 Pa.
    let start = pumped;
    while (
      roomPressure(start, deck, 'habitat') -
        roomPressure(start, deck, 'airlock') <
      101_300
    ) {
      start = loop.advance(1);
      expect(start.tick).toBeLessThan(400);
    }
    // A stalled pump moves no gas. The airlock's own off-gassing still adds
    // 5e-7 mol of volatiles a tick, so every other gas holds exactly.
    const held = start.compartments.airlock.moles;
    for (let tick = 0; tick < 10; tick++) {
      const next = loop.advance(1);
      const { volatiles, ...gases } = next.compartments.airlock.moles;
      const { volatiles: before, ...heldGases } = held;
      expect(gases).toStrictEqual(heldGases);
      expect(volatiles - before).toBeCloseTo(
        OFF_GASSING * 0.5 * (tick + 1),
        12,
      );
      expect(lifeSupportLoad(next)?.demand).toBeGreaterThanOrEqual(34_166);
    }
  });

  test.for([
    [
      'a heater in the airlock',
      { action: 'heater', compartment: 'airlock', on: true },
    ],
    [
      'a pump in the habitat',
      { action: 'pump', compartment: 'habitat', mode: 'fill' },
    ],
  ] as const)(
    'refuses %s as a bad argument',
    ([, command], { nexus: ship }) => {
      expect(() =>
        ship.get(COMMAND_DESK).submit({ system: 'life-support', ...command }),
      ).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
          system: 'life-support',
        }),
      );
      expect(ship.get(SHIP_STATE).log()).toEqual([]);
    },
  );

  test('stops stepping the air after an offline command', ({ nexus: ship }) => {
    const desk = ship.get(COMMAND_DESK);
    throttle(desk, 0.01);
    online(desk);
    const loop = ship.get(TICK_LOOP);
    const running = loop.advance(120);
    expect(running.setpoints.lifeSupport.online).toBe(true);

    desk.submit({ system: 'life-support', action: 'offline' });
    const stopped = loop.advance(1);
    expect(stopped.setpoints.lifeSupport.online).toBe(false);
    expect(loop.advance(120).compartments).toEqual(stopped.compartments);
  });

  test('holds the habitat at 292.6 K after an hour online at throttle 0.01', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    throttle(desk, 0.01);
    online(desk);
    const hour = ship.get(TICK_LOOP).advance(7_200);
    expect(hour.compartments.habitat.temperature.toFixed(1)).toBe('292.6');
    expect(hour.power.shed).toEqual([]);
  });
});
