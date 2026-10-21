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

  it('reads the pressure from the unrounded moles and rounds once', () => {
    // Each gas rounded to four digits first would drop 1000.4 to 1000 and
    // 3000.4 to 3000, which moves the pressure's fourth digit.
    const moles = { O2: 1000.4, N2: 3000.4, CO2: 2, H2O: 45, volatiles: 3 };
    const habitat = { moles, temperature: 293 };
    const odd: ShipSnapshot = {
      ...ship,
      compartments: { ...ship.compartments, habitat },
    };
    const sum = (values: Record<string, number>) =>
      Object.values(values).reduce((total, n) => total + n, 0);
    const once = roundNumber(pressure(sum(moles), 293, 120));
    const twice = roundNumber(
      pressure(sum(roundSnapshot(odd).compartments.habitat.moles), 293, 120),
    );
    expect(once).not.toBe(twice);
    expect(readShip(odd, plan).compartments.habitat.pressure).toBe(once);
  });

  it('throws when the deck plan has no volume for a compartment', () => {
    const noAirlock: DeckPlan = {
      ...plan,
      compartments: plan.compartments.filter(({ id }) => id !== 'airlock'),
    };
    expect(() => readShip(ship, noAirlock)).toThrow(
      "The deck plan has no compartment 'airlock'.",
    );
  });
});
