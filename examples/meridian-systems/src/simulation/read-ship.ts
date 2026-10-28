import { pressure } from '../physics/gas';

import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentReading,
  type DeckPlan,
  type ShipReading,
  type ShipSnapshot,
} from './contracts';
import { roundJson, roundReadingNumber } from './round-snapshot';

/**
 * Adds each compartment's pressure to `ship`, from the moles of every gas,
 * the temperature and the compartment's volume in `deck`, then rounds every
 * number to eight significant digits with `roundReadingNumber`. The routes and
 * the telemetry frames send this reading, and a console gauge then rounds it to
 * its own decimals. The golden's four digits would move a figure such as 2.0652
 * to 2.065 and a gauge of two decimals to 2.06. The pressure uses the unrounded
 * moles, so the reading rounds once.
 */
export function readShip(ship: ShipSnapshot, deck: DeckPlan): ShipReading {
  const volumes = new Map(
    deck.compartments.map((compartment) => [
      compartment.id,
      compartment.volume,
    ]),
  );
  const compartments = {} as Record<CompartmentId, CompartmentReading>;
  for (const id of COMPARTMENT_IDS) {
    const { moles, temperature } = ship.compartments[id];
    const total = Object.values(moles).reduce((sum, n) => sum + n, 0);
    const volume = volumes.get(id);
    if (volume === undefined)
      throw new Error(`The deck plan has no compartment '${id}'.`);
    compartments[id] = {
      moles,
      temperature,
      pressure: pressure(total, temperature, volume),
    };
  }
  return roundJson({ ...ship, compartments }, roundReadingNumber);
}
