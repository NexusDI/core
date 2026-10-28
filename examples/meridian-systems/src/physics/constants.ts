/** Gas constant in J/(mol K). */
export const R = 8.314;

/** Stefan-Boltzmann constant in W/(m² K⁴). */
export const SIGMA = 5.67e-8;

/** The temperature of deep space in K, the radiators' background. */
export const T_BACKGROUND = 4;

/** The temperature of the hull's inner skin in K, which every compartment loses heat to. */
export const T_HULL = 260;

/**
 * The exchange constant of a door or a vent in s/m. An opening of area `A`
 * empties a room of volume `V` with time constant `κ · V / A`.
 */
export const KAPPA = 0.02;

/** Molar heat capacity at constant volume of each gas, in J/(mol K). */
export const CV = {
  O2: 21.0,
  N2: 20.8,
  CO2: 28.9,
  H2O: 25.3,
  volatiles: 30.0,
} as const;
