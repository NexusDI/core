import { CV, KAPPA, R } from './constants';

/** The gases a compartment tracks. `volatiles` stands for every trace gas the fire and the reactor release. */
export type Gas = 'O2' | 'N2' | 'CO2' | 'H2O' | 'volatiles';

/** Every gas, in the order the physics iterates them. */
export const GASES: readonly Gas[] = ['O2', 'N2', 'CO2', 'H2O', 'volatiles'];

/** Ship air by mole fraction. `volatiles` is the remainder, so the fractions sum to 1. */
export const AIR: Readonly<Record<Gas, number>> = {
  O2: 0.21,
  N2: 0.78,
  CO2: 0.0004,
  H2O: 0.009,
  volatiles: 1 - 0.21 - 0.78 - 0.0004 - 0.009,
};

/** Ideal gas law: `P = nRT / V`, in pascals. */
export function pressure(
  moles: number,
  temperature: number,
  volume: number,
): number {
  return (moles * R * temperature) / volume;
}

/** The moles of each gas that fill `volume` at `pressure` and `temperature`, split by `fractions`. */
export function molesAt(
  pressure: number,
  temperature: number,
  volume: number,
  fractions: Readonly<Record<Gas, number>>,
): Record<Gas, number> {
  const total = (pressure * volume) / (R * temperature);
  const moles = {} as Record<Gas, number>;
  for (const gas of GASES) moles[gas] = total * fractions[gas];
  return moles;
}

/**
 * The air of one room: the moles of each gas and their temperature in K. The
 * simulation's `CompartmentState` has this shape.
 */
export interface Air {
  readonly moles: Readonly<Record<Gas, number>>;
  readonly temperature: number;
}

/** The moles of every gas together. */
export function totalMoles(moles: Readonly<Record<Gas, number>>): number {
  return GASES.reduce((sum, gas) => sum + moles[gas], 0);
}

/** `C = C_struct + Σ n_g · c_v,g`, in J/K. `structure` is the room's own heat capacity in J/K. */
export function heatCapacity(air: Air, structure: number): number {
  return GASES.reduce((sum, gas) => sum + air.moles[gas] * CV[gas], structure);
}

/**
 * The saturation pressure of water at `temperature` (K) in Pa, by the Magnus
 * formula `610.94 · exp(17.625 · (T − 273.15) / (T − 30.11))`.
 */
export function saturationPressure(temperature: number): number {
  return (
    610.94 * Math.exp((17.625 * (temperature - 273.15)) / (temperature - 30.11))
  );
}

/**
 * The share of every gas that stays in a room of `volume` (m³) after a vent
 * of `area` (m²) stands open to space for `dt` seconds:
 * `exp(−dt · A / (κ · V))`.
 */
export function ventFraction(area: number, volume: number, dt: number): number {
  return Math.exp((-dt * area) / (KAPPA * volume));
}

/**
 * Keeps `fraction` of every gas in `air`. The temperature stays: the model
 * leaves out the cooling of the gas that remains.
 */
export function vent(air: Air, fraction: number): Air {
  const moles = {} as Record<Gas, number>;
  for (const gas of GASES) moles[gas] = air.moles[gas] * fraction;
  return Object.freeze({
    moles: Object.freeze(moles),
    temperature: air.temperature,
  });
}

/**
 * Splits `air` in two: `moved` holds `fraction` (0 to 1) of each gas and
 * `kept` the rest. Both sides stay at the air's temperature.
 */
export function parcel(
  air: Air,
  fraction: number,
): { readonly kept: Air; readonly moved: Air } {
  const kept = {} as Record<Gas, number>;
  const moved = {} as Record<Gas, number>;
  for (const gas of GASES) {
    moved[gas] = fraction * air.moles[gas];
    kept[gas] = air.moles[gas] - moved[gas];
  }
  return Object.freeze({
    kept: Object.freeze({
      moles: Object.freeze(kept),
      temperature: air.temperature,
    }),
    moved: Object.freeze({
      moles: Object.freeze(moved),
      temperature: air.temperature,
    }),
  });
}

/**
 * Adds the parcel `incoming` to `target`, whose structure holds
 * `targetStructure` J/K.
 *
 * The parcel carries its energy `Σ n_p,g · c_v,g · T_p`, so the target settles
 * at `(C_t · T_t + Σ n_p,g · c_v,g · T_p) / (C_t + Σ n_p,g · c_v,g)`. Each
 * gas's moles and `Σ C · T` stay the same.
 */
export function mix(target: Air, targetStructure: number, incoming: Air): Air {
  const gained = {} as Record<Gas, number>;
  let energy = 0;
  let capacity = 0;
  for (const gas of GASES) {
    gained[gas] = target.moles[gas] + incoming.moles[gas];
    energy += incoming.moles[gas] * CV[gas] * incoming.temperature;
    capacity += incoming.moles[gas] * CV[gas];
  }
  const before = heatCapacity(target, targetStructure);
  return Object.freeze({
    moles: Object.freeze(gained),
    temperature: (before * target.temperature + energy) / (before + capacity),
  });
}

/**
 * Moves `fraction` (0 to 1) of each gas from `source` into `target`, whose
 * structure holds `targetStructure` J/K: a `parcel` of the source, then a
 * `mix` into the target. The source keeps its temperature.
 */
export function transfer(
  source: Air,
  target: Air,
  targetStructure: number,
  fraction: number,
): { readonly source: Air; readonly target: Air } {
  const { kept, moved } = parcel(source, fraction);
  return Object.freeze({
    source: kept,
    target: mix(target, targetStructure, moved),
  });
}

/**
 * Trades gas both ways between `a` and `b` through an open door: `fromA` of
 * each gas in `a` and `fromB` of each gas in `b`. Both parcels come from the
 * air as it stood before the exchange, and each mixes into the other side's
 * kept air at its own room's temperature, so two rooms at one molar density
 * and two temperatures still trade heat.
 */
export function exchange(
  a: Air,
  b: Air,
  structureA: number,
  structureB: number,
  fromA: number,
  fromB: number,
): { readonly a: Air; readonly b: Air } {
  const sentA = parcel(a, fromA);
  const sentB = parcel(b, fromB);
  return Object.freeze({
    a: mix(sentA.kept, structureA, sentB.moved),
    b: mix(sentB.kept, structureB, sentA.moved),
  });
}
