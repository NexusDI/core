import type { DeckPlan, IShipFiles } from '../../simulation/contracts';

import type { LifeSupportOptions, SensorCalibration } from './contracts';
import { LIFE_SUPPORT_RATINGS } from './life-support-model';

/** The calibration file the analyzers read. */
const CALIBRATION_FILE = 'sensors.calibration.json';

/**
 * The factory `LifeSupport.forRootAsync` runs at startup: the analyzers'
 * calibration, read through `files`, and the device ratings. A read that
 * rejects rejects the startup. Throws a plain `Error` for a file that holds
 * no compartments and for a compartment of `deck` with no calibration entry.
 */
export async function readCalibration(
  files: IShipFiles,
  deck: DeckPlan,
): Promise<LifeSupportOptions> {
  const file = (await files.read(CALIBRATION_FILE)) as SensorCalibration;
  if (typeof file?.compartments !== 'object' || file.compartments === null) {
    throw new Error(
      `The ship file '${CALIBRATION_FILE}' holds no compartments.`,
    );
  }
  for (const room of deck.compartments) {
    if (!Object.hasOwn(file.compartments, room.id)) {
      throw new Error(
        `The sensor calibration has no entry for the deck's compartment '${room.id}'.`,
      );
    }
  }
  return { calibration: file, ratings: LIFE_SUPPORT_RATINGS };
}
