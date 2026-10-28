import calibration from '../../../deck/sensors.calibration.json' with { type: 'json' };
import type { DeckPlan } from '../../simulation/contracts';

import type { LifeSupportOptions, SensorCalibration } from './contracts';
import { LIFE_SUPPORT_RATINGS } from './life-support-model';

/**
 * The factory `LifeSupport.forRootAsync` runs at startup: the analyzers'
 * calibration and the device ratings. It is async though the demo has
 * nothing to await, since the file is a static import; a ship that reads its
 * calibration from a device awaits that read here. Throws a plain `Error`
 * when a compartment of `deck` has no calibration entry.
 */
export async function readCalibration(
  deck: DeckPlan,
): Promise<LifeSupportOptions> {
  const file: SensorCalibration = calibration;
  for (const room of deck.compartments) {
    if (!Object.hasOwn(file.compartments, room.id)) {
      throw new Error(
        `The sensor calibration has no entry for the deck's compartment '${room.id}'.`,
      );
    }
  }
  return { calibration: file, ratings: LIFE_SUPPORT_RATINGS };
}
