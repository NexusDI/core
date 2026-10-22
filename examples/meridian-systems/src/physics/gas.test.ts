import { describe, expect, it } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import { CV, KAPPA } from './constants';
import {
  AIR,
  exchange,
  GASES,
  heatCapacity,
  mix,
  molesAt,
  parcel,
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

describe('a parcel and a mix', () => {
  it('splits each gas by the fraction at the air temperature', () => {
    const room = air(60_000, 310, 12);
    const { kept, moved } = parcel(room, 0.3);
    expect(kept.temperature).toBe(310);
    expect(moved.temperature).toBe(310);
    for (const gas of GASES) {
      expect(moved.moles[gas]).toBe(0.3 * room.moles[gas]);
      expect(kept.moles[gas]).toBe(room.moles[gas] - moved.moles[gas]);
    }
  });

  it('gives what transfer gives when the parcel is mixed into the target', () => {
    const source = air(60_000, 310, 12);
    const target = air(110_000, 285, 120);
    const { kept, moved } = parcel(source, 0.3);
    const mixed = mix(target, 4_000_000, moved);
    const reference = transfer(source, target, 4_000_000, 0.3);
    expect(kept).toEqual(reference.source);
    expect(mixed).toEqual(reference.target);
  });

  it('freezes what it returns', () => {
    const { kept, moved } = parcel(air(1, 293, 1), 0.5);
    expect(Object.isFrozen(kept.moles)).toBe(true);
    expect(Object.isFrozen(moved)).toBe(true);
    expect(Object.isFrozen(mix(air(1, 293, 1), 1, moved).moles)).toBe(true);
  });
});

describe('an exchange through a door', () => {
  // The bridge-habitat door of the deck, one tick of 0.5 s.
  const [bridge, habitat] = [60, 120];
  const [bridgeStructure, habitatStructure] = [2_000_000, 4_000_000];
  const f = 1 - Math.exp((-0.5 * 1.5) / (KAPPA * (bridge + habitat)));
  const fromA = (f * habitat) / (bridge + habitat);
  const fromB = (f * bridge) / (bridge + habitat);
  const swap = (a: Air, b: Air) =>
    exchange(a, b, bridgeStructure, habitatStructure, fromA, fromB);

  it('moves the net moles of the spec to 1e-12', () => {
    const a = air(100_000, 293, bridge);
    const b = air(50_000, 293, habitat);
    const next = swap(a, b);
    for (const gas of GASES) {
      const target =
        ((a.moles[gas] + b.moles[gas]) * bridge) / (bridge + habitat);
      const net = f * (target - a.moles[gas]);
      expect(
        Math.abs(next.a.moles[gas] - (a.moles[gas] + net)) / a.moles[gas],
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(next.b.moles[gas] - (b.moles[gas] - net)) / b.moles[gas],
      ).toBeLessThan(1e-12);
    }
  });

  it('runs as a transfer when one side sends nothing', () => {
    const a = air(60_000, 310, bridge);
    const b = air(110_000, 285, habitat);
    const next = exchange(a, b, bridgeStructure, habitatStructure, fromA, 0);
    const reference = transfer(a, b, habitatStructure, fromA);
    expect(next.b).toEqual(reference.target);
    expect(next.a.moles).toEqual(reference.source.moles);
    expect(
      Math.abs(next.a.temperature - a.temperature) / a.temperature,
    ).toBeLessThan(1e-15);
  });

  it('trades heat and CO2 between a hot bridge and the habitat', () => {
    let a: Air = {
      moles: { ...air(101_300, 330, bridge).moles, CO2: 50 },
      temperature: 330,
    };
    let b = air(101_300, 293, habitat);
    const moles = GASES.map((gas) => a.moles[gas] + b.moles[gas]);
    const total = energy(a, bridgeStructure) + energy(b, habitatStructure);
    for (let tick = 0; tick < 200; tick += 1) {
      const next = swap(a, b);
      a = next.a;
      b = next.b;
    }
    GASES.forEach((gas, i) => {
      const after = a.moles[gas] + b.moles[gas];
      expect(Math.abs(after - moles[i]) / moles[i]).toBeLessThan(1e-12);
    });
    const after = energy(a, bridgeStructure) + energy(b, habitatStructure);
    expect(Math.abs(after - total) / total).toBeLessThan(1e-12);
    expect(a.moles.CO2 / bridge).toBeCloseTo(0.28887, 5);
    expect(b.moles.CO2 / habitat).toBeCloseTo(0.28887, 5);
  });

  it('freezes what it returns', () => {
    const next = swap(air(1, 293, bridge), air(1, 293, habitat));
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.a.moles)).toBe(true);
    expect(Object.isFrozen(next.b)).toBe(true);
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
        floodCharge: 1_000,
        equipment: ['heater', 'scrubber', 'oxygen'],
      },
      {
        id: 'habitat',
        volume: 120,
        conductance: 150,
        structureHeatCapacity: 4_000_000,
        occupants: 4,
        floodCharge: 2_000,
        equipment: ['heater', 'scrubber', 'oxygen'],
      },
      {
        id: 'reactor-bay',
        volume: 80,
        conductance: 110,
        structureHeatCapacity: 6_000_000,
        occupants: 0,
        coolantConductance: 2,
        floodCharge: 1_330,
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
