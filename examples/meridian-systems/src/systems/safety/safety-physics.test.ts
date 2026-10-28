import { describe, expect, it, vi } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import { AIR, molesAt } from '../../physics/gas';
import {
  COMPARTMENT_IDS,
  type DeckPlan,
  type IRandomSource,
  type ShipSnapshot,
  type TickContext,
} from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { CalibratedProbe } from '../life-support/calibrated-probe';
import type { IAtmosphereProbe } from '../life-support/contracts';
import { LIFE_SUPPORT_RATINGS } from '../life-support/life-support-model';

import { stepSafety } from './safety-model';
import { SafetyPhysics } from './safety-physics';

const plan = deck satisfies DeckPlan;
const dt = 0.5;
const probe = new CalibratedProbe(
  new SeededRandom({ seed: 7 }),
  { calibration, ratings: LIFE_SUPPORT_RATINGS },
  plan,
);

function idle(): ShipSnapshot {
  return new ShipStateStore(plan).snapshot();
}

/** A tick-1 context whose fork answers `draws` in turn. */
function context(start: ShipSnapshot, draws: number[] = []): TickContext {
  const rng: IRandomSource = {
    next: vi.fn(() => {
      const value = draws.shift();
      if (value === undefined) throw new Error('no draw left');
      return value;
    }),
    fork: () => rng,
  };
  return { tick: 1, dt, rng, start };
}

/** `ship` with the habitat at `pa` Pa and `temperature` K. */
function habitatAt(
  ship: ShipSnapshot,
  pa: number,
  temperature = 293,
): ShipSnapshot {
  const room = plan.compartments.find((entry) => entry.id === 'habitat');
  if (!room) throw new Error('the deck has no habitat');
  return {
    ...ship,
    compartments: {
      ...ship.compartments,
      habitat: {
        moles: molesAt(pa, temperature, room.volume, AIR),
        temperature,
      },
    },
  };
}

describe('SafetyPhysics', () => {
  it('runs in phase 5 as Safety', () => {
    const physics = new SafetyPhysics(plan, probe);
    expect(physics.name).toBe('Safety');
    expect(physics.phase).toBe(5);
    expect(SafetyPhysics.phase).toBe(5);
  });

  it('leaves the idle ship as it went in and draws nothing', () => {
    const ship = idle();
    const tick = context(ship);
    const next = new SafetyPhysics(plan, probe).step(ship, tick);
    expect(next.compartments).toBe(ship.compartments);
    expect(next.setpoints).toBe(ship.setpoints);
    expect(next.safety.alarms).toEqual([]);
    expect(tick.rng.next).not.toHaveBeenCalled();
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('steps the ship through stepSafety with the deck and the probe', () => {
    const start = idle();
    const ship: ShipSnapshot = {
      ...start,
      setpoints: {
        ...start.setpoints,
        safety: {
          ...start.setpoints.safety,
          doors: { ...start.setpoints.safety.doors, 'bridge-habitat': true },
        },
      },
    };
    const next = new SafetyPhysics(plan, probe).step(ship, context(start));
    const expected = stepSafety({
      ids: COMPARTMENT_IDS,
      start: {
        compartments: start.compartments,
        alarms: start.safety.alarms,
      },
      compartments: ship.compartments,
      rooms: plan.compartments,
      doors: plan.doors,
      setpoints: ship.setpoints.safety,
      record: ship.safety,
      engineering: {
        coolant: ship.coolant.temperature,
        tripped: ship.reactor.tripped,
        shed: ship.power.shed,
      },
      read: (id, air, tick) => probe.read(id, air, tick),
      draw: () => {
        throw new Error('the idle doors draw nothing');
      },
      tick: 1,
      dt,
    });
    expect(next.compartments).toEqual(expected.compartments);
    expect(next.safety).toEqual(expected.safety);
    expect(next.setpoints.safety).toEqual(expected.setpoints);
    expect(next.reactor).toBe(ship.reactor);
  });

  it('reads the start-of-tick air from the context', () => {
    const start = idle();
    // 1,300 Pa lost in 0.5 s is −2,600 Pa/s, past the −2,000 Pa/s limit.
    const ship = habitatAt(start, 100_000);
    const physics = new SafetyPhysics(plan, probe);
    expect(physics.step(ship, context(start)).safety.alarms).toEqual([
      { code: 'DECOMPRESSION', subject: 'habitat' },
    ]);
    expect(physics.step(ship, context(ship)).safety.alarms).toEqual([]);
  });

  it('draws the ignition from the tick fork', () => {
    const start = habitatAt(idle(), 117_549, 340);
    const tick = context(start, [0]);
    const next = new SafetyPhysics(plan, probe).step(start, tick);
    expect(tick.rng.next).toHaveBeenCalledOnce();
    expect(next.safety.fires.habitat).toBe(0.05);
    expect(next.safety.alarms).toContainEqual({
      code: 'FIRE',
      subject: 'habitat',
    });
  });

  it('raises SENSOR_FAULT in every room when the probe throws', () => {
    const broken: IAtmosphereProbe = {
      read: () => {
        throw new Error('the analyzer is off its mount');
      },
    };
    const ship = idle();
    const next = new SafetyPhysics(plan, broken).step(ship, context(ship));
    expect(next.safety.alarms).toEqual(
      COMPARTMENT_IDS.map((id) => ({ code: 'SENSOR_FAULT', subject: id })),
    );
  });
});
