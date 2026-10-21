import type { ShipSnapshot } from '@nexusdi/meridian-systems';

/**
 * The habitat's volume in cubic metres, a copy of the deck plan's in
 * meridian-systems. The snapshot carries moles and temperature only, so the
 * console needs the volume to read a pressure.
 */
export const HABITAT_VOLUME = 120;

/** The gas constant in J/(mol K), as meridian-systems' physics uses it. */
const R = 8.314;

/** The habitat's pressure in pascals, by the ideal gas law `P = nRT / V`. */
export function habitatPressure(ship: ShipSnapshot): number {
  const { moles, temperature } = ship.compartments.habitat;
  const total = Object.values(moles).reduce((sum, n) => sum + n, 0);
  return (total * R * temperature) / HABITAT_VOLUME;
}
