import { R } from './constants';

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
  return {
    O2: total * fractions.O2,
    N2: total * fractions.N2,
    CO2: total * fractions.CO2,
    H2O: total * fractions.H2O,
    volatiles: total * fractions.volatiles,
  };
}
