import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { LITHIUM_LOOP } from '../../physics/thermal';
import { RAILGUN } from '../../physics/weapons';
import type {
  DeckPlan,
  IRandomSource,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { IWeaponMount } from './contracts';
import { WeaponsPhysics } from './weapons-physics';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();

/** 0.0899 K: a quarter of the 300 MJ shot over the loop's heat capacity. */
const PULSE_KELVIN =
  (0.25 * 300e6) / (LITHIUM_LOOP.mass * LITHIUM_LOOP.heatCapacity);

const mount: IWeaponMount = {
  rating: RAILGUN,
  fire: () => {
    throw new Error('the step fires nothing');
  },
};

/** A random source that answers `value` and counts its draws. */
function source(value: number) {
  let draws = 0;
  const rng: IRandomSource = {
    next: () => {
      draws += 1;
      return value;
    },
    fork: () => {
      throw new Error('the step forks nothing');
    },
  };
  return { rng, draws: () => draws };
}

function context(rng: IRandomSource): TickContext {
  return { tick: 32, dt: 0.5, rng, start: idle };
}

/** The idle ship with a waiting shot at 10 km, 150 MJ charged and the railgun allocated 300 MW. */
const waiting: ShipSnapshot = {
  ...idle,
  weapons: { ...idle.weapons, status: 'charging', charge: 150e6 },
  power: {
    ...idle.power,
    loads: idle.power.loads.map((entry) =>
      entry.id === 'railgun'
        ? { ...entry, demand: 300e6, allocated: 300e6 }
        : entry,
    ),
  },
  setpoints: { ...idle.setpoints, weapons: { armed: true, range: 10_000 } },
};

describe('WeaponsPhysics', () => {
  it('runs in phase 3 as Weapons', () => {
    const physics = new WeaponsPhysics(mount);
    expect(physics.name).toBe('Weapons');
    expect(physics.phase).toBe(3);
    expect(WeaponsPhysics.phase).toBe(3);
  });

  it('returns the ship it got on an idle tick and draws nothing', () => {
    const { rng, draws } = source(0);
    expect(new WeaponsPhysics(mount).step(idle, context(rng))).toBe(idle);
    expect(draws()).toBe(0);
  });

  it('fires with a draw of the tick context and heats the loop by 0.0899 K', () => {
    const { rng, draws } = source(0.5);
    const next = new WeaponsPhysics(mount).step(waiting, context(rng));
    expect(draws()).toBe(1);
    expect(next.weapons).toEqual({
      status: 'charging',
      charge: 0,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });
    expect(next.setpoints).toEqual({
      ...waiting.setpoints,
      weapons: { armed: true, range: null },
    });
    expect(next.coolant.temperature - waiting.coolant.temperature).toBeCloseTo(
      PULSE_KELVIN,
      12,
    );
    expect(PULSE_KELVIN).toBeCloseTo(0.0899, 4);
  });

  it('misses on a draw of 0.99', () => {
    const { rng } = source(0.99);
    const next = new WeaponsPhysics(mount).step(waiting, context(rng));
    expect(next.weapons.lastShot).toEqual({
      tick: 32,
      range: 10_000,
      hit: false,
    });
    expect(next.weapons.hits).toBe(0);
  });

  it('charges with the allocation and keeps the setpoints and the loop', () => {
    const { rng, draws } = source(0);
    const ship: ShipSnapshot = {
      ...waiting,
      weapons: idle.weapons,
    };
    const next = new WeaponsPhysics(mount).step(ship, context(rng));
    expect(next.weapons.charge).toBe(150_000_000);
    expect(next.setpoints).toBe(ship.setpoints);
    expect(next.coolant).toBe(ship.coolant);
    expect(draws()).toBe(0);
  });

  it('freezes the snapshot it builds at every level', () => {
    const next = new WeaponsPhysics(mount).step(
      waiting,
      context(source(0).rng),
    );
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.weapons)).toBe(true);
    expect(Object.isFrozen(next.weapons.lastShot)).toBe(true);
    expect(Object.isFrozen(next.setpoints)).toBe(true);
    expect(Object.isFrozen(next.setpoints.weapons)).toBe(true);
    expect(Object.isFrozen(next.coolant)).toBe(true);
  });
});
