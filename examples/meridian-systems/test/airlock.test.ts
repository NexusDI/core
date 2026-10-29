import { describe, expect } from 'vitest';

import { InterlockError } from '../src/errors';
import { doorPressures } from '../src/physics/doors';
import { COMMAND_DESK, type ICommandDesk } from '../src/simulation/commands';
import {
  DECK_PLAN,
  type DeckPlan,
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../src/simulation/contracts';

import { shipRoot } from './ship-root';
import { shipTest } from './fixtures';
import { INTERLOCK_PLUGINS } from './support';

const test = shipTest(shipRoot(), {
  plugins: INTERLOCK_PLUGINS,
});

const pump = (desk: ICommandDesk, mode: string) =>
  desk.submit({
    system: 'life-support',
    action: 'pump',
    compartment: 'airlock',
    mode,
  });
const vent = (desk: ICommandDesk, open: boolean) =>
  desk.submit({
    system: 'life-support',
    action: 'vent',
    compartment: 'airlock',
    open,
  });
const open = (desk: ICommandDesk, door: string) =>
  desk.submit({ system: 'safety', action: 'open', door });
const close = (desk: ICommandDesk, door: string) =>
  desk.submit({ system: 'safety', action: 'close', door });

/** Expects the interlock to refuse `door` with `difference` Pa across it. */
function refused(desk: ICommandDesk, door: string, difference: number) {
  const call = () => open(desk, door);
  expect(call).toThrow(InterlockError);
  expect(call).toThrow(expect.objectContaining({ door, difference }));
}

/** The true pressure difference across `door`, in Pa. */
function gap(ship: ShipSnapshot, deck: DeckPlan, door: string): number {
  const plan = deck.doors.find((entry) => entry.id === door);
  if (!plan) throw new Error(`the deck has no door ${door}`);
  const [a, b] = doorPressures(ship.compartments, deck.compartments, plan);
  return Math.abs(a - b);
}

describe('the airlock drill under the interlock', () => {
  test('pumps the airlock down, vents it, holds the outer door open 20 ticks and fills it to the inner door', ({
    nexus: ship,
  }) => {
    const desk = ship.get(COMMAND_DESK);
    const loop = ship.get(TICK_LOOP);
    const deck = ship.get(DECK_PLAN);
    const alarmed: number[] = [];
    let now = ship.get(SHIP_STATE).snapshot();

    /** Advances `loop` a tick at a time to `tick`, noting each tick with an alarm. */
    const to = (target: number) => {
      while (now.tick < target) {
        now = loop.advance(1);
        if (now.safety.alarms.length > 0) alarmed.push(now.tick);
      }
    };

    expect(
      desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 }),
    ).toEqual({ tick: 1 });
    expect(desk.submit({ system: 'life-support', action: 'online' })).toEqual({
      tick: 1,
    });
    expect(pump(desk, 'evacuate')).toEqual({ tick: 1 });

    // The pump stalls by tick 288, and the vent takes the airlock on down.
    to(288);
    refused(desk, 'airlock-outer', 9_089);
    refused(desk, 'habitat-airlock', 101_339);
    expect(pump(desk, 'off')).toEqual({ tick: 289 });
    expect(vent(desk, true)).toEqual({ tick: 289 });

    to(316);
    refused(desk, 'airlock-outer', 5_072);
    to(317);
    expect(open(desk, 'airlock-outer')).toEqual({ tick: 318 });

    // The outer door stands open 20 ticks, then the pump fills the airlock.
    to(337);
    expect(close(desk, 'airlock-outer')).toEqual({ tick: 338 });
    expect(vent(desk, false)).toEqual({ tick: 338 });
    expect(pump(desk, 'fill')).toEqual({ tick: 338 });
    refused(desk, 'habitat-airlock', 110_413);
    to(338);
    refused(desk, 'habitat-airlock', 109_401);

    to(445);
    refused(desk, 'habitat-airlock', 5_915);
    to(446);
    expect(pump(desk, 'off')).toEqual({ tick: 447 });
    expect(open(desk, 'habitat-airlock')).toEqual({ tick: 447 });

    to(466);
    expect(now.setpoints.safety.doors['habitat-airlock']).toBe(true);
    const inner = gap(now, deck, 'habitat-airlock');
    expect(inner).toBeGreaterThan(131.5);
    expect(inner).toBeLessThan(133.5);
    expect(alarmed).toEqual([]);

    const log = ship.get(SHIP_STATE).log();
    expect(log.map((entry) => entry.tick)).toEqual([1, 289, 318, 338, 447]);
    expect(log.find((entry) => entry.tick === 338)?.change).toStrictEqual({
      safety: { doors: { 'airlock-outer': false } },
      lifeSupport: { vents: { airlock: false }, pumps: { airlock: 'fill' } },
    });
  });
});
