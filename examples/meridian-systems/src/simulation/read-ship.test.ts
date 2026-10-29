import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { pressure } from '../physics/gas';
import { shipState } from '../../test/ship-state';

import type { DeckPlan, ShipSnapshot } from './contracts';
import { readShip } from './read-ship';
import { roundJson, roundReadingNumber } from './round-snapshot';

const plan: DeckPlan = deck;
const ship = shipState(plan).snapshot();

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
      roundReadingNumber(pressure(moles, 330, 120)),
    );
  });

  it('keeps the snapshot rounded to the reading digits beside each pressure', () => {
    const reading = readShip(ship, plan);
    const rounded = roundJson(ship, roundReadingNumber);
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
    // Each gas rounded to eight digits first moves the pressure's eighth
    // digit from 82215.069 to 82215.068.
    const moles = {
      O2: 1000.000_027_4,
      N2: 3000.000_018_2,
      CO2: 2.000_000_82,
      H2O: 45.000_006_6,
      volatiles: 3,
    };
    const habitat = { moles, temperature: 293 };
    const odd: ShipSnapshot = {
      ...ship,
      compartments: { ...ship.compartments, habitat },
    };
    const sum = (values: Record<string, number>) =>
      Object.values(values).reduce((total, n) => total + n, 0);
    const once = roundReadingNumber(pressure(sum(moles), 293, 120));
    const twice = roundReadingNumber(
      pressure(
        sum(roundJson(odd, roundReadingNumber).compartments.habitat.moles),
        293,
        120,
      ),
    );
    expect(once).not.toBe(twice);
    expect(readShip(odd, plan).compartments.habitat.pressure).toBe(once);
  });

  it('keeps enough digits for a gauge to round the reading once', () => {
    // Four digits turn 2.0652 into 2.065, and a gauge of two decimals then
    // prints 2.06 for a ship at 2.0652 m/s.
    const moving: ShipSnapshot = {
      ...ship,
      drive: { ...ship.drive, velocity: 2.065_2 },
    };
    const velocity = readShip(moving, plan).drive.velocity;
    expect(velocity).toBe(2.065_2);
    expect(velocity.toFixed(2)).toBe('2.07');
  });

  it('rounds a reading to eight significant digits and keeps an integer exact', () => {
    const odd: ShipSnapshot = {
      ...ship,
      drive: { ...ship.drive, velocity: 1.234_567_891_234, distance: 12_345 },
    };
    const { drive } = readShip(odd, plan);
    expect(drive.velocity).toBe(1.234_567_9);
    expect(drive.distance).toBe(12_345);
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
