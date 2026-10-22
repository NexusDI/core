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
 * Moves `fraction` (0 to 1) of each gas from `source` into `target`, whose
 * structure holds `targetStructure` J/K.
 *
 * The moved gas carries its energy `Σ Δn_g · c_v,g · T_s`, so the target
 * settles at `(C_t · T_t + Σ Δn_g · c_v,g · T_s) / (C_t + Σ Δn_g · c_v,g)` and
 * the source keeps its temperature. Each gas's moles and the rooms' total
 * `Σ C · T` stay the same.
 */
export function transfer(
  source: Air,
  target: Air,
  targetStructure: number,
  fraction: number,
): { readonly source: Air; readonly target: Air } {
  const left = {} as Record<Gas, number>;
  const gained = {} as Record<Gas, number>;
  let energy = 0;
  let capacity = 0;
  for (const gas of GASES) {
    const moved = fraction * source.moles[gas];
    left[gas] = source.moles[gas] - moved;
    gained[gas] = target.moles[gas] + moved;
    energy += moved * CV[gas] * source.temperature;
    capacity += moved * CV[gas];
  }
  const before = heatCapacity(target, targetStructure);
  return Object.freeze({
    source: Object.freeze({
      moles: Object.freeze(left),
      temperature: source.temperature,
    }),
    target: Object.freeze({
      moles: Object.freeze(gained),
      temperature: (before * target.temperature + energy) / (before + capacity),
    }),
  });
}
