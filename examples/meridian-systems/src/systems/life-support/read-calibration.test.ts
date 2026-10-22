import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import { LIFE_SUPPORT_RATINGS } from '../../physics/atmosphere';
import type { DeckPlan } from '../../simulation/contracts';
import { readCalibration } from './read-calibration';

const plan = deck satisfies DeckPlan;

describe('readCalibration', () => {
  it('answers the calibration file and the ratings', async () => {
    await expect(readCalibration(plan)).resolves.toEqual({
      calibration,
      ratings: LIFE_SUPPORT_RATINGS,
    });
  });

  it('refuses a deck compartment the calibration has no entry for', async () => {
    const galley = { ...plan.compartments[0], id: 'galley' };
    await expect(
      readCalibration({
        ...plan,
        compartments: [...plan.compartments, galley],
      }),
    ).rejects.toThrow(
      "The sensor calibration has no entry for the deck's compartment 'galley'.",
    );
  });
});
