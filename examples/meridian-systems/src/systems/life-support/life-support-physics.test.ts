import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import type {
  DeckPlan,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { shipState } from '../../../test/ship-state';

import { LIFE_SUPPORT_RATINGS, stepAtmosphere } from './life-support-model';
import { LifeSupportPhysics } from './life-support-physics';

const plan = deck satisfies DeckPlan;
const options = { calibration, ratings: LIFE_SUPPORT_RATINGS };
const tick: TickContext = {
  tick: 1,
  dt: 0.5,
  rng: new SeededRandom({ seed: 7 }),
  start: shipState(plan).snapshot(),
};

/** The deck's initial ship, online, with the habitat at 290 K and the loads `shed`. */
function onlineShip(shed: readonly string[] = []): ShipSnapshot {
  const idle = shipState(plan).snapshot();
  return {
    ...idle,
    compartments: {
      ...idle.compartments,
      habitat: { ...idle.compartments.habitat, temperature: 290 },
    },
    power: { ...idle.power, shed },
    setpoints: {
      ...idle.setpoints,
      lifeSupport: { ...idle.setpoints.lifeSupport, online: true },
    },
  };
}

describe('LifeSupportPhysics', () => {
  it('runs in phase 4 as LifeSupport', () => {
    const physics = new LifeSupportPhysics(options, plan);
    expect(physics.name).toBe('LifeSupport');
    expect(physics.phase).toBe(4);
    expect(LifeSupportPhysics.phase).toBe(4);
  });

  it('returns the ship unchanged while offline', () => {
    const ship = shipState(plan).snapshot();
    expect(new LifeSupportPhysics(options, plan).step(ship, tick)).toBe(ship);
  });

  it('steps the air of every compartment online', () => {
    const ship = onlineShip();
    const next = new LifeSupportPhysics(options, plan).step(ship, tick);
    const expected = stepAtmosphere({
      compartments: ship.compartments,
      rooms: plan.compartments,
      setpoints: ship.setpoints.lifeSupport,
      coolantTemperature: ship.coolant.temperature,
      shed: false,
      dt: 0.5,
      ratings: LIFE_SUPPORT_RATINGS,
    });
    expect(next.compartments).toEqual(expected.compartments);
    expect(next.lifeSupport).toEqual(expected.lifeSupport);
    // 10 kW/K over the habitat's 3 K below target clamps at the 10 kW rating,
    // and the nine other heated rooms sit at their target.
    const heated = Object.keys(ship.setpoints.lifeSupport.heaters);
    expect(heated).toHaveLength(10);
    expect(next.lifeSupport.heaters).toEqual({
      ...Object.fromEntries(heated.map((id) => [id, 0])),
      habitat: 10_000,
    });
    expect(next.reactor).toBe(ship.reactor);
    expect(next.setpoints).toBe(ship.setpoints);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('runs no heater on a tick that sheds life support', () => {
    const next = new LifeSupportPhysics(options, plan).step(
      onlineShip(['life-support']),
      tick,
    );
    expect(Object.values(next.lifeSupport.heaters)).toEqual(
      Array.from({ length: 10 }, () => 0),
    );
  });
});
