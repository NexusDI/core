import type { PowerLoad } from '../engineering/contracts';

import type {
  RailgunRating,
  WeaponsRecord,
  WeaponsSetpoints,
  WeaponsStatus,
} from './contracts';

/** The Meridian's railgun. */
export const RAILGUN: RailgunRating = {
  capacity: 400e6,
  shot: 300e6,
  power: 300e6,
  pulseShare: 0.25,
  accuracy: 0.8,
  falloff: 50_000,
  range: 100_000,
};

/**
 * The capacitor's place on the power router. The capacitor stores
 * what it draws, so none of its power heats the loop; a shot puts its share
 * into the loop as a pulse. The mount asks its demand from `railgunDemand`.
 */
export const RAILGUN_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'railgun',
  priority: 6,
  heatShare: 0,
};

/**
 * The power the capacitor asks the router for, in W, from the snapshot at the
 * start of the tick: `min(P_max, (E_max − E) / dt)` while armed below a full
 * bank, and 0 W otherwise. The tick that fills the bank asks only what fits,
 * so the capacitor stores every joule it draws.
 */
export function railgunDemand(
  weapons: WeaponsRecord,
  setpoints: WeaponsSetpoints,
  rating: RailgunRating,
  dt: number,
): number {
  return setpoints.armed && weapons.charge < rating.capacity
    ? Math.min(rating.power, (rating.capacity - weapons.charge) / dt)
    : 0;
}

/** The chance a shot at `range` m hits, `accuracy · exp(−range / falloff)`. */
export function hitChance(range: number, rating: RailgunRating): number {
  return rating.accuracy * Math.exp(-range / rating.falloff);
}

/** Everything one railgun step reads beside the record and the setpoints. */
interface WeaponsTick {
  /** The tick this step computes. */
  readonly tick: number;
  /** Seconds. */
  readonly dt: number;
  /** The router's `railgun` allocation this tick, in W. */
  readonly allocated: number;
  /** True when the router shed the `railgun` load this tick. */
  readonly shed: boolean;
  /** The next number of the hit stream, 0 to 1. The step calls it once a shot. */
  readonly draw: () => number;
}

/**
 * What one railgun step gives. `pulse` is the heat a shot puts into the
 * coolant loop, in J, and 0 on every other tick.
 */
export interface WeaponsStep {
  readonly weapons: WeaponsRecord;
  readonly setpoints: WeaponsSetpoints;
  readonly pulse: number;
}

/**
 * Steps the railgun in phase 3.
 *
 * The capacitor first charges by its allocation times `dt`, up to `capacity`.
 * A shot that waits then fires once the bank holds `shot` J: it spends the
 * charge, draws one number, hits when that number is under `hitChance`,
 * clears the waiting range and gives the loop `pulseShare · shot` of heat. An
 * empty bank fires on its second charging tick. The step derives the status
 * on every tick. A step that changes nothing returns the objects it got, and
 * every record it builds is frozen.
 */
export function stepWeapons(
  weapons: WeaponsRecord,
  setpoints: WeaponsSetpoints,
  { tick, dt, allocated, shed, draw }: WeaponsTick,
  rating: RailgunRating,
): WeaponsStep {
  let charge = Math.min(rating.capacity, weapons.charge + allocated * dt);
  let { shots, hits, lastShot } = weapons;
  let next = setpoints;
  let pulse = 0;
  if (setpoints.range !== null && charge >= rating.shot) {
    const hit = draw() < hitChance(setpoints.range, rating);
    charge -= rating.shot;
    shots += 1;
    hits += hit ? 1 : 0;
    lastShot = Object.freeze({ tick, range: setpoints.range, hit });
    next = Object.freeze({ ...setpoints, range: null });
    pulse = rating.pulseShare * rating.shot;
  }
  const status: WeaponsStatus =
    charge >= rating.capacity
      ? 'charged'
      : !next.armed
        ? 'idle'
        : shed
          ? 'held'
          : 'charging';
  const same =
    charge === weapons.charge &&
    status === weapons.status &&
    lastShot === weapons.lastShot;
  return {
    weapons: same
      ? weapons
      : Object.freeze({ status, charge, shots, hits, lastShot }),
    setpoints: next,
    pulse,
  };
}
