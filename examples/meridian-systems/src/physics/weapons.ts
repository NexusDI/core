import type { PowerLoad } from './power';

/** The railgun mount's fixed figures. */
export interface RailgunRating {
  /** The most the capacitor holds, E_max, in J. */
  readonly capacity: number;
  /** The charge one shot spends, E_shot, in J. */
  readonly shot: number;
  /** The most the capacitor draws while it charges, P_max, in W. */
  readonly power: number;
  /** The share of a shot's charge that ends in the coolant loop as one pulse. */
  readonly pulseShare: number;
  /** The chance of a hit at 0 m, 0 to 1. */
  readonly accuracy: number;
  /** The range over which the hit chance falls by a factor of e, in m. */
  readonly falloff: number;
  /** The farthest range the mount fires at, in m. */
  readonly range: number;
}

/** The Meridian's railgun, from spec §5.9. */
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
 * The capacitor's place on the power router, spec §5.7. The capacitor stores
 * what it draws, so none of its power heats the loop; a shot puts its share
 * into the loop as a pulse. The mount asks its demand from `railgunDemand`.
 */
export const RAILGUN_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'railgun',
  priority: 6,
  heatShare: 0,
};

/**
 * `idle`: unarmed. `held`: armed below a full bank, and the router shed the
 * capacitor this tick. `charging`: armed below a full bank. `charged`: the
 * bank holds `capacity`.
 */
export type WeaponsStatus = 'idle' | 'held' | 'charging' | 'charged';

/** One shot the railgun fired. */
export interface RailgunShot {
  readonly tick: number;
  /** The range the crew ordered, in m. */
  readonly range: number;
  readonly hit: boolean;
}

/** The railgun at the end of a tick. */
export interface WeaponsRecord {
  readonly status: WeaponsStatus;
  /** The capacitor's charge, in J. */
  readonly charge: number;
  /** Shots fired since tick 0, and how many hit. */
  readonly shots: number;
  readonly hits: number;
  /** The newest shot, or null before the first. */
  readonly lastShot: RailgunShot | null;
}

/** What the crew set for the railgun. */
export interface WeaponsSetpoints {
  /** True once the crew fired: the capacitor charges to `capacity` and holds it. */
  readonly armed: boolean;
  /** The range of the shot that waits for the charge, in m, or null. */
  readonly range: number | null;
}

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
 * Steps the railgun in phase 3 (spec §5.9).
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
