import { describe, expect, it } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import { CV } from './constants';
import {
  AIR,
  GASES,
  heatCapacity,
  molesAt,
  pressure,
  saturationPressure,
  totalMoles,
  transfer,
  vent,
  ventFraction,
  type Air,
} from './gas';

/** A room at `temperature` and `pa`, filled with ship air. */
function air(pa: number, temperature: number, volume: number): Air {
  return { moles: molesAt(pa, temperature, volume, AIR), temperature };
}

/** `C · T` of one room, its structure and its gas together, in J. */
function energy(room: Air, structure: number): number {
  return heatCapacity(room, structure) * room.temperature;
}

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

describe('the heat capacity of a room', () => {
  it('gives the habitat 4,104,250 J/K at the initial air', () => {
    const habitat = air(101_300, 293, 120);
    expect(
      Math.abs(heatCapacity(habitat, 4_000_000) - 4_104_250),
    ).toBeLessThanOrEqual(1);
  });

  it('adds each gas at its molar heat capacity', () => {
    const one = { O2: 1, N2: 1, CO2: 1, H2O: 1, volatiles: 1 };
    const sum = GASES.reduce((total, gas) => total + CV[gas], 0);
    expect(heatCapacity({ moles: one, temperature: 293 }, 1_000)).toBeCloseTo(
      sum + 1_000,
      12,
    );
  });
});

describe('the saturation pressure of water', () => {
  it('reads 2,312 Pa at 293 K by Magnus', () => {
    expect(Math.abs(saturationPressure(293) - 2_312)).toBeLessThan(1);
  });

  it('reads 610.94 Pa at the freezing point', () => {
    expect(saturationPressure(273.15)).toBeCloseTo(610.94, 9);
  });
});

describe('a vent to space', () => {
  it('removes 2.0618 % of the airlock per tick', () => {
    expect(1 - ventFraction(0.01, 12, 0.5)).toBeCloseTo(0.020618, 6);
  });

  it('takes a full airlock under 100 Pa at tick 333', () => {
    const fraction = ventFraction(0.01, 12, 0.5);
    let airlock = air(101_300, 293, 12);
    let tick = 0;
    const below = () =>
      pressure(totalMoles(airlock.moles), airlock.temperature, 12) < 100;
    while (!below()) {
      airlock = vent(airlock, fraction);
      tick += 1;
    }
    expect(tick).toBe(333);
  });

  it('keeps the temperature and scales every gas alike', () => {
    const airlock = air(101_300, 280, 12);
    const vented = vent(airlock, 0.5);
    expect(vented.temperature).toBe(280);
    for (const gas of GASES) {
      expect(vented.moles[gas]).toBe(airlock.moles[gas] * 0.5);
    }
  });
});

describe('a transfer between rooms', () => {
  const cases = [
    {
      source: air(101_300, 293, 12),
      target: air(101_300, 293, 120),
      f: 1 / 120,
    },
    { source: air(60_000, 310, 12), target: air(110_000, 285, 120), f: 0.3 },
    { source: air(9_000, 250, 80), target: air(90_000, 300, 60), f: 1 },
  ];

  it('conserves each gas and Σ C · T to 1e-12', () => {
    for (const { source, target, f } of cases) {
      const moved = transfer(source, target, 4_000_000, f);
      for (const gas of GASES) {
        const before = source.moles[gas] + target.moles[gas];
        const after = moved.source.moles[gas] + moved.target.moles[gas];
        expect(Math.abs(after - before) / before).toBeLessThan(1e-12);
      }
      const before = energy(source, 500_000) + energy(target, 4_000_000);
      const after =
        energy(moved.source, 500_000) + energy(moved.target, 4_000_000);
      expect(Math.abs(after - before) / before).toBeLessThan(1e-12);
    }
  });

  it('moves the fraction of each gas and keeps the source temperature', () => {
    const { source, target, f } = cases[1];
    const moved = transfer(source, target, 4_000_000, f);
    expect(moved.source.temperature).toBe(source.temperature);
    for (const gas of GASES) {
      expect(moved.source.moles[gas]).toBeCloseTo(
        source.moles[gas] * (1 - f),
        9,
      );
    }
    expect(moved.target.temperature).toBeGreaterThan(target.temperature);
  });

  it('leaves two rooms at one temperature at that temperature', () => {
    const moved = transfer(
      air(101_300, 293, 12),
      air(101_300, 293, 120),
      4_000_000,
      0.25,
    );
    expect(moved.source.temperature).toBe(293);
    expect(moved.target.temperature).toBeCloseTo(293, 12);
  });

  it('freezes what it returns', () => {
    const moved = transfer(air(1, 293, 1), air(1, 293, 1), 1, 0.5);
    expect(Object.isFrozen(moved.source)).toBe(true);
    expect(Object.isFrozen(moved.target.moles)).toBe(true);
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
        equipment: ['heater', 'scrubber', 'oxygen'],
      },
      {
        id: 'habitat',
        volume: 120,
        conductance: 150,
        structureHeatCapacity: 4_000_000,
        occupants: 4,
        equipment: ['heater', 'scrubber', 'oxygen'],
      },
      {
        id: 'reactor-bay',
        volume: 80,
        conductance: 110,
        structureHeatCapacity: 6_000_000,
        occupants: 0,
        coolantConductance: 2,
      },
      {
        id: 'airlock',
        volume: 12,
        conductance: 30,
        structureHeatCapacity: 500_000,
        occupants: 0,
        equipment: ['vent', 'pump'],
        pumpReservoir: 'habitat',
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
