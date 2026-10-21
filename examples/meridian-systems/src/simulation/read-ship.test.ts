import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { pressure } from '../physics/gas';
import type { DeckPlan, ShipSnapshot } from './contracts';
import { readShip } from './read-ship';
import { roundNumber, roundSnapshot } from './round-snapshot';
import { ShipStateStore } from './ship-state-store';

const plan: DeckPlan = deck;
const ship = new ShipStateStore(plan).snapshot();

describe('readShip', () => {
  it('reads 101.3 kPa in the habitat at tick 0 from the deck plan', () => {
    expect(readShip(ship, plan).compartments.habitat.pressure).toBe(101_300);
  });

  it("reads each compartment's pressure from all its moles, its temperature and its volume", () => {
    const habitat = ship.compartments.habitat;
    const hot: ShipSnapshot = {
      ...ship,
      compartments: {
        ...ship.compartments,
        habitat: { ...habitat, temperature: 330 },
      },
    };
    const moles = Object.values(habitat.moles).reduce((sum, n) => sum + n, 0);
    expect(readShip(hot, plan).compartments.habitat.pressure).toBe(
      roundNumber(pressure(moles, 330, 120)),
    );
  });

  it('keeps the rounded snapshot beside each pressure', () => {
    const reading = readShip(ship, plan);
    const rounded = roundSnapshot(ship);
    expect(reading.tick).toBe(rounded.tick);
    expect(reading.time).toBe(rounded.time);
    for (const [id, compartment] of Object.entries(rounded.compartments)) {
      expect(
        reading.compartments[id as keyof typeof rounded.compartments],
      ).toMatchObject(compartment);
    }
    expect(JSON.parse(JSON.stringify(reading))).toStrictEqual(reading);
  });
});
