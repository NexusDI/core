import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type {
  DeckPlan,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { IMainDrive } from './contracts';
import { PLASMA_DRIVE } from './propulsion-model';
import { PropulsionPhysics } from './propulsion-physics';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();
const tick: TickContext = {
  tick: 1,
  dt: 0.5,
  rng: new SeededRandom({ seed: 7 }),
  start: idle,
};

const drive: IMainDrive = {
  rating: PLASMA_DRIVE,
  throttle: () => {
    throw new Error('the step queues nothing');
  },
};

/** The idle ship after a phase 1 that allocated the main drive `allocated` W. */
function powered(allocated: number): ShipSnapshot {
  return {
    ...idle,
    power: {
      ...idle.power,
      loads: [
        ...idle.power.loads.filter(({ id }) => id !== 'main-drive'),
        { id: 'main-drive', priority: 5, demand: 600e6, allocated },
      ],
      shed: allocated === 0 ? ['main-drive'] : [],
    },
    setpoints: { ...idle.setpoints, drive: { throttle: 1 } },
  };
}

describe('PropulsionPhysics', () => {
  it('runs in phase 2 as Propulsion', () => {
    const physics = new PropulsionPhysics(drive);
    expect(physics.name).toBe('Propulsion');
    expect(physics.phase).toBe(2);
    expect(PropulsionPhysics.phase).toBe(2);
  });

  it('returns the ship it got at rest with no main-drive load', () => {
    const bare: ShipSnapshot = {
      ...idle,
      power: {
        ...idle.power,
        loads: idle.power.loads.filter(({ id }) => id !== 'main-drive'),
      },
    };
    expect(new PropulsionPhysics(drive).step(bare, tick)).toBe(bare);
  });

  it('returns the ship it got at rest when the router shed the main drive', () => {
    const ship = powered(0);
    expect(new PropulsionPhysics(drive).step(ship, tick)).toBe(ship);
  });

  it("burns with the main drive's allocation", () => {
    const next = new PropulsionPhysics(drive).step(powered(600e6), tick);
    expect(next.drive).toEqual({
      thrust: 14_400,
      massFlow: 0.288,
      acceleration: 0.0036,
      velocity: 0.0018,
      distance: 0.0009,
    });
  });

  it('reads the rating behind the main drive', () => {
    const slow = { ...drive, rating: { ...PLASMA_DRIVE, exhaust: 100_000 } };
    expect(
      new PropulsionPhysics(slow).step(powered(600e6), tick).drive.thrust,
    ).toBe(7_200);
  });

  it('accelerates by the cosine of the start-of-tick attitude against the course', () => {
    const start = {
      ...idle,
      helm: { attitude: 0.3, rate: 0.01, torque: 5e6 },
    };
    const ship: ShipSnapshot = {
      ...powered(600e6),
      helm: { attitude: 0.9, rate: 0.02, torque: 5e6 },
      setpoints: {
        ...powered(600e6).setpoints,
        helm: { heading: 0.5 },
      },
    };
    const next = new PropulsionPhysics(drive).step(ship, { ...tick, start });
    expect(next.drive.acceleration).toBe(
      (14_400 * Math.cos(0.3 - 0.5)) / 4.0e6,
    );
    expect(next.drive.acceleration).not.toBe(
      (14_400 * Math.cos(0.9 - 0.5)) / 4.0e6,
    );
    expect(next.helm).toBe(ship.helm);
  });

  it('returns a frozen snapshot with a frozen drive', () => {
    const next = new PropulsionPhysics(drive).step(powered(600e6), tick);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.drive)).toBe(true);
  });
});
