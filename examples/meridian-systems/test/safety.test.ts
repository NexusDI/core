import { defineModule, Nexus, provide } from '@nexusdi/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { Safety } from '../src/systems/safety/safety.module';
import { ShipLifeSupport } from '../src/systems/life-support/life-support.module';
import { InterlockError } from '../src/errors';
import { pressure, totalMoles } from '../src/physics/gas';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  type CompartmentId,
  DECK_PLAN,
  type DeckPlan,
  type ITickLoop,
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { ATMOSPHERE_PROBE } from '../src/systems/life-support/contracts';
import {
  ALARM_SINKS,
  BLAST_DOORS,
  FIRE_SUPPRESSION,
  type IAlarmSink,
  MASTER_ALARM,
} from '../src/systems/safety/contracts';

import { shipRoot } from './ship-root';
import { shipTest } from './fixtures';
import {
  INTERLOCK_PLUGINS,
  online,
  RecordingAlarmSink,
  throttle,
} from './support';

/** The system modules whose tokens these cases read from the root. */
const READS = [Safety, ShipLifeSupport];
const open = (desk: ICommandDesk, door: string) =>
  desk.submit({ system: 'safety', action: 'open', door });
const flood = (desk: ICommandDesk, compartment: string) =>
  desk.submit({ system: 'safety', action: 'flood', compartment });
const drill = (desk: ICommandDesk, compartment: string) =>
  desk.submit({ system: 'safety', action: 'drill', compartment });

function roomPressure(ship: ShipSnapshot, deck: DeckPlan, id: CompartmentId) {
  const room = deck.compartments.find((entry) => entry.id === id);
  if (!room) throw new Error(`the deck has no ${id}`);
  const air = ship.compartments[id];
  return pressure(totalMoles(air.moles), air.temperature, room.volume);
}

/** Advances `loop` a tick at a time until the fire in `id` is out, and returns that tick. */
function fireOut(loop: ITickLoop, id: CompartmentId): number {
  for (let ticks = 0; ticks < 200; ticks++) {
    const ship = loop.advance(1);
    if (ship.safety.fires[id] === 0) return ship.tick;
  }
  throw new Error(`the fire in ${id} burns 200 ticks on`);
}

/**
 * The ship with `sink` among the alarm sinks. The sink's module publishes
 * ALARM_SINKS in its exports, so all(ALARM_SINKS) in Safety reads the sink
 * with no global and no import of Safety.
 */
function shipWith(sink: IAlarmSink) {
  const AlarmLog = defineModule({
    name: 'AlarmLog',
    providers: [provide(ALARM_SINKS, { useValue: sink })],
    exports: [ALARM_SINKS],
  });
  return shipRoot({ reads: [...READS, AlarmLog] });
}

/** The sink of the ship every case but the interlock's builds, which each case starts empty. */
const sink = new RecordingAlarmSink();
const test = shipTest(shipWith(sink));

beforeEach(() => {
  sink.calls.length = 0;
});

describe('Safety', () => {
  it('passes the check', () => {
    expect(() => Nexus.check(shipRoot({ reads: READS }))).not.toThrow();
  });

  test("shows the root Safety's tokens and the probe Safety reads", ({
    nexus: ship,
  }) => {
    expect(ship.get(BLAST_DOORS)).toBeDefined();
    expect(ship.get(FIRE_SUPPRESSION)).toBeDefined();
    expect(ship.get(MASTER_ALARM).active()).toEqual([]);
    expect(ship.get(ATMOSPHERE_PROBE)).toBeDefined();
  });

  test('answers a safety command through the desk and opens the door on the next tick', ({
    nexus: ship,
  }) => {
    const answer = ship.get(COMMAND_DESK).submit({
      system: 'safety',
      action: 'open',
      door: 'bridge-habitat',
    });
    expect(answer).toEqual({ tick: 1 });
    const next = ship.get(TICK_LOOP).advance(1);
    expect(next.setpoints.safety.doors['bridge-habitat']).toBe(true);
  });
});

describe('the interlock on the blast doors', () => {
  const test = shipTest(shipRoot({ reads: READS }), {
    plugins: INTERLOCK_PLUGINS,
  });

  test('refuses the outer door at tick 0, with the full sea-level pressure across it', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const call = () => open(desk, 'airlock-outer');
    expect(call).toThrow(InterlockError);
    expect(call).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_INTERLOCK',
        door: 'airlock-outer',
        difference: 101_300,
        limit: 5_000,
      }),
    );
    expect(ship.get(TICK_LOOP).advance(1).setpoints.safety.doors).toEqual({
      'bridge-habitat': false,
      'habitat-reactor-bay': false,
      'habitat-airlock': false,
      'airlock-outer': false,
    });
  });

  test('opens a door with equal pressures on both sides', ({ nexus: ship }) => {
    expect(open(ship.get(COMMAND_DESK), 'bridge-habitat')).toEqual({
      tick: 1,
    });
  });
});

describe('a decompression through both airlock doors', () => {
  test('shuts the habitat in and raises the alarm for one tick', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    const deck = ship.get(DECK_PLAN);
    open(desk, 'habitat-airlock');
    open(desk, 'airlock-outer');

    const first = loop.advance(1);
    expect(roomPressure(first, deck, 'habitat')).toBeCloseTo(101_300, 0);
    expect(roomPressure(first, deck, 'airlock')).toBeCloseTo(8_315.2, 0);
    expect(first.safety.alarms).toEqual([]);

    const second = loop.advance(1);
    expect(roomPressure(second, deck, 'habitat')).toBeCloseTo(99_581.5, 0);
    expect(second.safety.alarms).toEqual([
      { code: 'DECOMPRESSION', subject: 'habitat' },
    ]);
    expect(ship.get(MASTER_ALARM).active()).toEqual(second.safety.alarms);
    expect(second.setpoints.safety.doors).toEqual({
      'bridge-habitat': false,
      'habitat-reactor-bay': false,
      'habitat-airlock': false,
      'airlock-outer': true,
    });

    const third = loop.advance(1);
    expect(roomPressure(third, deck, 'airlock')).toBeCloseTo(171.8, 1);
    expect(third.safety.alarms).toEqual([]);
    // The airlock cycles by design, so it raises no atmosphere alarm.
    expect(sink.calls).toEqual([
      'raised DECOMPRESSION habitat at tick 2',
      'cleared DECOMPRESSION habitat at tick 3',
    ]);
  });
});

describe('a fire in the habitat', () => {
  test('lights in the hot habitat on a draw and goes out under a flood', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    const state = ship.get(SHIP_STATE);
    const deck = ship.get(DECK_PLAN);
    const start = state.snapshot();
    // No room in the seeded ship reaches 330 K, so the test commits a hot
    // habitat to reach the ignition draw.
    state.commit({
      ...start,
      compartments: {
        ...start.compartments,
        habitat: { ...start.compartments.habitat, temperature: 340 },
      },
    });

    // Seed 7's Safety fork gives its first draw under the ignition chance
    // on tick 177, and the fire grows to 1 over 38 ticks.
    expect(loop.advance(176).safety.fires.habitat).toBe(0);
    expect(loop.advance(1).safety.fires.habitat).toBe(0.05);
    expect(loop.advance(37).safety.fires.habitat).toBeLessThan(1);
    expect(loop.advance(1).safety.fires.habitat).toBe(1);
    const burning = loop.advance(185);
    expect(burning.safety.fires.habitat).toBe(1);
    expect(burning.safety.alarms).toEqual([
      { code: 'FIRE', subject: 'habitat' },
      { code: 'CO2_HIGH', subject: 'habitat' },
      { code: 'TEMPERATURE', subject: 'habitat' },
    ]);

    // The flood applies at tick 401 and empties the charge over 20 ticks.
    flood(desk, 'habitat');
    expect(loop.advance(19).setpoints.safety.floods.habitat).toBe(true);
    const emptied = loop.advance(1);
    expect(emptied.setpoints.safety.floods.habitat).toBe(false);
    expect(emptied.safety.flooded.habitat).toBe(0);
    const out = fireOut(loop, 'habitat');
    expect(out).toBeGreaterThanOrEqual(458);
    expect(out).toBeLessThanOrEqual(462);
    const after = loop.advance(600 - out);
    expect(roomPressure(after, deck, 'habitat') / 1_000).toBeCloseTo(167.6, 0);
    expect(sink.calls).toContain('raised FIRE habitat at tick 177');
    expect(sink.calls).toContain(`cleared FIRE habitat at tick ${out}`);
  });

  test('lights a drill on the next tick and floods it out, and a drill on the flooded room lights nothing', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    const deck = ship.get(DECK_PLAN);
    throttle(desk, 0.01);
    online(desk);
    drill(desk, 'habitat');

    const lit = loop.advance(1);
    expect(lit.safety.fires.habitat).toBe(0.05);
    expect(lit.setpoints.safety.drills.habitat).toBe(false);
    expect(lit.safety.alarms).toEqual([{ code: 'FIRE', subject: 'habitat' }]);

    const full = loop.advance(39);
    expect(full.safety.fires.habitat).toBe(1);
    expect(full.compartments.habitat.temperature).toBeCloseTo(293.501, 3);
    expect(roomPressure(full, deck, 'habitat')).toBeCloseTo(101_495.1, 1);

    loop.advance(20);
    flood(desk, 'habitat');
    const out = fireOut(loop, 'habitat');
    expect(out).toBeGreaterThanOrEqual(120);
    expect(out).toBeLessThanOrEqual(124);

    const settled = loop.advance(200 - out);
    expect(roomPressure(settled, deck, 'habitat')).toBeGreaterThan(142_152.5);
    expect(roomPressure(settled, deck, 'habitat')).toBeLessThan(143_152.5);
    expect(settled.compartments.habitat.temperature).toBeCloseTo(294.49, 1);
    expect(settled.setpoints.safety.floods.habitat).toBe(false);
    expect(settled.safety.alarms).toEqual([]);

    drill(desk, 'habitat');
    const drilled = loop.advance(1);
    expect(drilled.safety.fires.habitat).toBe(0);
    expect(drilled.setpoints.safety.drills.habitat).toBe(false);
  });
});
