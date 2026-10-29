import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import { BundledShipFiles } from '../../simulation/bundled-ship-files';
import type { DeckPlan, IShipFiles } from '../../simulation/contracts';

import { LIFE_SUPPORT_RATINGS } from './life-support-model';
import { readCalibration } from './read-calibration';

const plan = deck satisfies DeckPlan;
const files = new BundledShipFiles();

describe('readCalibration', () => {
  it('answers the calibration file and the ratings', async () => {
    await expect(readCalibration(files, plan)).resolves.toEqual({
      calibration,
      ratings: LIFE_SUPPORT_RATINGS,
    });
  });

  it('refuses a deck compartment the calibration has no entry for', async () => {
    const galley = { ...plan.compartments[0], id: 'galley' };
    await expect(
      readCalibration(files, {
        ...plan,
        compartments: [...plan.compartments, galley],
      }),
    ).rejects.toThrow(
      "The sensor calibration has no entry for the deck's compartment 'galley'.",
    );
  });

  it('reads the calibration through the ship files it gets', async () => {
    const read: string[] = [];
    const recording: IShipFiles = {
      async read(name) {
        read.push(name);
        return calibration;
      },
    };
    await readCalibration(recording, plan);
    expect(read).toEqual(['sensors.calibration.json']);
  });

  it('refuses a calibration file that holds no compartments', async () => {
    const empty: IShipFiles = { read: async () => ({ resolution: {} }) };
    await expect(readCalibration(empty, plan)).rejects.toThrow(
      "The ship file 'sensors.calibration.json' holds no compartments.",
    );
  });
});
