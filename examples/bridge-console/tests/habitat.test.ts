// @vitest-environment node
// The test reads the deck plan from disk, which needs Node's file URLs.
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { HABITAT_VOLUME, habitatPressure } from '../app/bridge/habitat';
import { shipAtStart } from './doubles';

describe("the console's habitat", () => {
  it('holds the habitat volume of the deck plan', async () => {
    const deck = JSON.parse(
      await readFile(
        new URL(
          '../../meridian-systems/deck/meridian.deck.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { compartments: { id: string; volume: number }[] };
    expect(deck.compartments.find(({ id }) => id === 'habitat')?.volume).toBe(
      HABITAT_VOLUME,
    );
  });

  it('reads 101.3 kPa from ship air at 293 K', () => {
    expect(habitatPressure(shipAtStart)).toBeCloseTo(101_300, 6);
  });
});
