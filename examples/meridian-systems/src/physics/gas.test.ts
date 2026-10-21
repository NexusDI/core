import { describe, expect, it } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import { AIR, GASES, molesAt, pressure } from './gas';

describe('the gas law', () => {
  it('puts the habitat air at 101.3 kPa', () => {
    const moles = molesAt(101_300, 293, 120, AIR);
    const total = GASES.reduce((sum, gas) => sum + moles[gas], 0);
    expect(Math.abs(pressure(total, 293, 120) - 101_300)).toBeLessThan(101.3);
  });

  it('has air fractions that sum to 1', () => {
    const sum = GASES.reduce((total, gas) => total + AIR[gas], 0);
    expect(sum).toBeCloseTo(1, 12);
    expect(AIR.O2).toBe(0.21);
    expect(AIR.N2).toBe(0.78);
    expect(AIR.CO2).toBe(0.0004);
    expect(AIR.H2O).toBe(0.009);
  });

  it('round-trips pressure through molesAt', () => {
    for (const [p, t, v] of [
      [101_300, 293, 120],
      [50_000, 260, 12],
      [1, 400, 80],
      [250_000, 150, 60],
    ] as const) {
      const moles = molesAt(p, t, v, AIR);
      const total = GASES.reduce((sum, gas) => sum + moles[gas], 0);
      expect(Math.abs(pressure(total, t, v) - p) / p).toBeLessThan(1e-9);
    }
  });
});

describe('the deck plan', () => {
  it('holds the four compartments of the ship in order', () => {
    expect(deck.compartments).toEqual([
      {
        id: 'bridge',
        volume: 60,
        conductance: 90,
        structureHeatCapacity: 2_000_000,
        occupants: 2,
      },
      {
        id: 'habitat',
        volume: 120,
        conductance: 150,
        structureHeatCapacity: 4_000_000,
        occupants: 4,
      },
      {
        id: 'reactor-bay',
        volume: 80,
        conductance: 110,
        structureHeatCapacity: 6_000_000,
        occupants: 0,
      },
      {
        id: 'airlock',
        volume: 12,
        conductance: 30,
        structureHeatCapacity: 500_000,
        occupants: 0,
      },
    ]);
  });

  it('holds the four doors in order', () => {
    expect(deck.doors).toEqual([
      { id: 'bridge-habitat', between: ['bridge', 'habitat'], area: 1.5 },
      {
        id: 'habitat-reactor-bay',
        between: ['habitat', 'reactor-bay'],
        area: 1.5,
      },
      { id: 'habitat-airlock', between: ['habitat', 'airlock'], area: 1.2 },
      { id: 'airlock-outer', between: ['airlock', 'space'], area: 1.2 },
    ]);
  });

  it('starts every compartment at 293 K and 101.3 kPa', () => {
    expect(deck.initial).toEqual({ temperature: 293, pressure: 101_300 });
  });
});
