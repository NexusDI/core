import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { HULL, RCS_THRUSTERS, stepHelm } from '../../physics/motion';
import type {
  DeckPlan,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { IThrusters } from './contracts';
import { HelmPhysics } from './helm-physics';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();
const tick: TickContext = {
  tick: 1,
  dt: 0.5,
  rng: new SeededRandom({ seed: 7 }),
  start: idle,
};

const thrusters: IThrusters = {
  rating: RCS_THRUSTERS,
  steer: () => {
    throw new Error('the step queues nothing');
  },
};

/** The idle ship steering for 1 rad from rest, with the loads `shed`. */
function steering(shed: readonly string[] = []): ShipSnapshot {
  return {
    ...idle,
    power: { ...idle.power, shed },
    setpoints: { ...idle.setpoints, helm: { heading: 1 } },
  };
}

describe('HelmPhysics', () => {
  it('runs in phase 2 as Helm', () => {
    const physics = new HelmPhysics(thrusters);
    expect(physics.name).toBe('Helm');
    expect(physics.phase).toBe(2);
    expect(HelmPhysics.phase).toBe(2);
  });

  it('returns the ship it got when the helm holds its course', () => {
    expect(new HelmPhysics(thrusters).step(idle, tick)).toBe(idle);
  });

  it('turns the ship with the torque of the PD law', () => {
    const ship = steering();
    const next = new HelmPhysics(thrusters).step(ship, tick);
    expect(next.helm).toEqual(
      stepHelm(
        ship.helm,
        ship.setpoints.helm,
        { dt: 0.5, shed: false },
        RCS_THRUSTERS,
        HULL,
      ),
    );
    expect(next.helm.torque).toBe(5_000_000);
    expect(next.power).toBe(ship.power);
    expect(next.setpoints).toBe(ship.setpoints);
  });

  it('reads the rating behind the thrusters', () => {
    const weak = { ...thrusters, rating: { ...RCS_THRUSTERS, maxTorque: 1e6 } };
    expect(new HelmPhysics(weak).step(steering(), tick).helm.torque).toBe(
      1_000_000,
    );
  });

  it('returns the ship it got at rest when the router shed the thrusters', () => {
    const ship = steering(['thrusters']);
    expect(new HelmPhysics(thrusters).step(ship, tick)).toBe(ship);
  });

  it('applies no torque on a shed tick while the ship turns', () => {
    const ship = {
      ...steering(['thrusters']),
      helm: { attitude: 0.1, rate: 0.01, torque: 5e6 },
    };
    const next = new HelmPhysics(thrusters).step(ship, tick);
    expect(next.helm).toEqual({
      attitude: 0.1 + 0.01 * 0.5,
      rate: 0.01,
      torque: 0,
    });
  });

  it('returns a frozen snapshot with a frozen helm', () => {
    const next = new HelmPhysics(thrusters).step(steering(), tick);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.helm)).toBe(true);
  });
});
