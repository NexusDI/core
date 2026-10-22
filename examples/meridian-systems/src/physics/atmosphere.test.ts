import { describe, expect, it } from 'vitest';
import {
  LIFE_SUPPORT_RATINGS,
  OCCUPANT,
  OFF_GASSING,
  lifeSupportDemand,
  pumpDraw,
  pumpFraction,
  pumpStalled,
  stepAtmosphere,
  oxygenRate,
  type AtmosphereInput,
  type AtmosphereResult,
  type LifeSupportSetpoints,
  type RoomPlan,
} from './atmosphere';
import { R } from './constants';
import {
  AIR,
  GASES,
  molesAt,
  pressure,
  saturationPressure,
  totalMoles,
  transfer,
  ventFraction,
  type Air,
} from './gas';

const dt = 0.5;
const ratings = LIFE_SUPPORT_RATINGS;

/** The deck of ruling 3: the four rooms with their equipment. */
const ROOMS: readonly RoomPlan[] = [
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
];

const ONLINE: LifeSupportSetpoints = {
  online: true,
  heaters: {
    bridge: { on: true, target: 293 },
    habitat: { on: true, target: 293 },
  },
  scrubbers: { bridge: true, habitat: true },
  oxygen: { bridge: true, habitat: true },
  vents: { airlock: false },
  pumps: { airlock: 'off' },
};

const ALL_OFF: LifeSupportSetpoints = {
  ...ONLINE,
  heaters: {
    bridge: { on: false, target: 293 },
    habitat: { on: false, target: 293 },
  },
  scrubbers: { bridge: false, habitat: false },
  oxygen: { bridge: false, habitat: false },
};

function room(id: string): RoomPlan {
  const plan = ROOMS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`no room ${id}`);
  return plan;
}

function air(pa: number, temperature: number, volume: number): Air {
  return { moles: molesAt(pa, temperature, volume, AIR), temperature };
}

/** Every room at 293 K and 101.3 kPa, as the deck starts. */
function initial(): Record<string, Air> {
  return Object.fromEntries(
    ROOMS.map((plan) => [plan.id, air(101_300, 293, plan.volume)]),
  );
}

function input(overrides: Partial<AtmosphereInput> = {}): AtmosphereInput {
  return {
    compartments: initial(),
    rooms: ROOMS,
    setpoints: ONLINE,
    coolantTemperature: 500,
    shed: false,
    dt,
    ratings,
    ...overrides,
  };
}

function roomPressure(state: Air, volume: number): number {
  return pressure(totalMoles(state.moles), state.temperature, volume);
}

function partial(state: Air, gas: 'O2' | 'CO2' | 'H2O', volume: number) {
  return (state.moles[gas] * R * state.temperature) / volume;
}

/** Steps `start` for `ticks` ticks and hands each result to `visit`. */
function run(
  start: AtmosphereInput,
  ticks: number,
  visit: (tick: number, next: AtmosphereResult) => void = () => undefined,
): AtmosphereResult {
  let result = stepAtmosphere(start);
  visit(1, result);
  for (let tick = 2; tick <= ticks; tick++) {
    result = stepAtmosphere({ ...start, compartments: result.compartments });
    visit(tick, result);
  }
  return result;
}

describe('the crew and the deck in one tick', () => {
  it('breathes and off-gasses per spec §5.3', () => {
    const start = initial();
    const next = stepAtmosphere(
      input({ compartments: start, setpoints: ALL_OFF }),
    ).compartments;
    const before = start.habitat.moles;
    const after = next.habitat.moles;
    expect(after.O2 - before.O2).toBeCloseTo(-4 * OCCUPANT.O2 * dt, 12);
    expect(after.CO2 - before.CO2).toBeCloseTo(4 * OCCUPANT.CO2 * dt, 12);
    expect(after.H2O - before.H2O).toBeCloseTo(4 * OCCUPANT.H2O * dt, 12);
    expect(after.volatiles - before.volatiles).toBeCloseTo(
      OFF_GASSING * dt,
      12,
    );
    expect(after.N2).toBe(before.N2);
    expect(OCCUPANT).toEqual({
      O2: 3.038e-4,
      CO2: 2.63e-4,
      H2O: 1.606e-3,
      heat: 100,
    });
  });

  it('freezes the compartments and the heater record', () => {
    const result = stepAtmosphere(input());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.compartments)).toBe(true);
    expect(Object.isFrozen(result.compartments.habitat)).toBe(true);
    expect(Object.isFrozen(result.compartments.habitat.moles)).toBe(true);
    expect(Object.isFrozen(result.lifeSupport.heaters)).toBe(true);
    expect(Object.keys(result.lifeSupport.heaters)).toEqual([
      'bridge',
      'habitat',
    ]);
  });
});

describe('the scrubber', () => {
  it('holds the habitat CO₂ at 2.525 mol, 51.3 Pa at 293 K', () => {
    const habitat = room('habitat');
    const result = run(input({ rooms: [habitat] }), 60_000);
    const co2 = result.compartments.habitat.moles.CO2;
    expect(co2).toBeCloseTo(2.525, 3);
    expect(Math.abs((co2 * R * 293) / habitat.volume - 51.3)).toBeLessThan(0.1);
  });

  it('holds the habitat at 40.00 % relative humidity', () => {
    const habitat = room('habitat');
    run(input({ rooms: [habitat] }), 7_200, (tick, { compartments }) => {
      if (tick < 600) return;
      const state = compartments.habitat;
      const humidity =
        partial(state, 'H2O', habitat.volume) /
        saturationPressure(state.temperature);
      expect(humidity).toBeGreaterThanOrEqual(0.4 - 1e-4);
      expect(humidity).toBeLessThan(0.4 + 5e-5);
    });
  });
});

describe('the oxygen generator', () => {
  it('settles 60.8 Pa under 21 kPa and draws 729 W', () => {
    const habitat = room('habitat');
    const start = air(101_300, 293, habitat.volume);
    const moles = {
      ...start.moles,
      O2: (21_000 * habitat.volume) / (R * 293),
    };
    const result = run(
      input({
        rooms: [habitat],
        compartments: { habitat: { ...start, moles } },
      }),
      60_000,
    );
    const state = result.compartments.habitat;
    expect(21_000 - partial(state, 'O2', habitat.volume)).toBeCloseTo(60.8, 1);
    const draw =
      oxygenRate(state, habitat.volume, ratings.electrolyser) *
      ratings.electrolyser.energy;
    expect(Math.abs(draw - 729)).toBeLessThan(2);
  });
});

describe('the coolant leak into the reactor bay', () => {
  it('holds the bay at 264.3 K beside a 500 K loop', () => {
    const bay = room('reactor-bay');
    const settled = (110 * 260 + 2 * 500) / 112;
    expect(settled).toBeCloseTo(264.3, 1);
    const result = run(
      input({
        rooms: [bay],
        compartments: { 'reactor-bay': air(101_300, settled, bay.volume) },
      }),
      7_200,
    );
    expect(result.compartments['reactor-bay'].temperature).toBeCloseTo(
      settled,
      9,
    );
  });

  it('cools a 293 K bay toward that figure', () => {
    const bay = room('reactor-bay');
    const result = run(input({ rooms: [bay] }), 7_200);
    const temperature = result.compartments['reactor-bay'].temperature;
    expect(temperature).toBeLessThan(293);
    expect(temperature).toBeGreaterThan(264.3);
  });
});

describe('lifeSupportDemand', () => {
  it('asks for 0 W offline', () => {
    const cold = initial();
    cold.habitat = air(101_300, 280, 120);
    expect(
      lifeSupportDemand(cold, ROOMS, { ...ONLINE, online: false }, ratings),
    ).toBe(0);
  });

  it('sums the heaters, scrubbers, generators and pumps that run', () => {
    const start = initial();
    expect(lifeSupportDemand(start, ROOMS, ONLINE, ratings)).toBe(2 * 1_200);
    expect(
      lifeSupportDemand(
        start,
        ROOMS,
        { ...ONLINE, pumps: { airlock: 'evacuate' } },
        ratings,
      ),
    ).toBeCloseTo(2 * 1_200 + 400, 9);
    start.habitat = air(101_300, 292.9, 120);
    start.bridge = air(101_300, 280, 60);
    expect(lifeSupportDemand(start, ROOMS, ONLINE, ratings)).toBeCloseTo(
      2 * 1_200 + 1_000 + 10_000,
      6,
    );
    const lean = initial();
    const moles = { ...lean.habitat.moles, O2: (20_500 * 120) / (R * 293) };
    lean.habitat = { moles, temperature: 293 };
    expect(lifeSupportDemand(lean, ROOMS, ONLINE, ratings)).toBeCloseTo(
      2 * 1_200 + 0.01 * 600_000,
      6,
    );
  });
});

describe('the transfer pump', () => {
  it('draws 400 W at no rise and 34,166.67 W from 101.3 kPa', () => {
    expect(pumpDraw(0, ratings.pump)).toBe(400);
    expect(pumpDraw(-5_000, ratings.pump)).toBe(400);
    expect(pumpDraw(101_300, ratings.pump)).toBeCloseTo(34_166.67, 2);
    expect(pumpDraw(200_000, ratings.pump)).toBeCloseTo(34_166.67, 2);
  });

  it('moves 0.008333 of the airlock per tick', () => {
    expect(pumpFraction(12, ratings.pump, dt)).toBeCloseTo(0.008333, 6);
    expect(pumpFraction(120, ratings.pump, dt)).toBeCloseTo(8.333e-4, 7);
    expect(pumpFraction(0.05, ratings.pump, dt)).toBe(1);
  });

  it('stalls at tick 288 emptying the airlock into the habitat', () => {
    const airlock = room('airlock');
    const habitat = room('habitat');
    let a = air(101_300, 293, airlock.volume);
    let h = air(101_300, 293, habitat.volume);
    let tick = 1;
    for (; tick < 10_000; tick++) {
      const rise =
        roomPressure(h, habitat.volume) - roomPressure(a, airlock.volume);
      if (pumpStalled(rise, ratings.pump)) break;
      const moved = transfer(
        a,
        h,
        habitat.structureHeatCapacity,
        pumpFraction(airlock.volume, ratings.pump, dt),
      );
      a = moved.source;
      h = moved.target;
    }
    expect(tick).toBe(288);
    expect(Math.abs(roomPressure(a, airlock.volume) - 9_174)).toBeLessThan(1);
    expect(Math.abs(roomPressure(h, habitat.volume) - 110_513)).toBeLessThan(1);
  });

  it('fills the airlock from the habitat', () => {
    const start = initial();
    start.airlock = air(100, 293, 12);
    const filled = stepAtmosphere(
      input({
        compartments: start,
        setpoints: { ...ALL_OFF, pumps: { airlock: 'fill' } },
      }),
    ).compartments;
    expect(totalMoles(filled.airlock.moles)).toBeGreaterThan(
      totalMoles(start.airlock.moles) + 4,
    );
  });

  it('moves no gas once stalled, and keeps drawing', () => {
    const start = initial();
    start.airlock = air(50, 293, 12);
    start.habitat = air(101_400, 293, 120);
    const setpoints: LifeSupportSetpoints = {
      ...ALL_OFF,
      pumps: { airlock: 'evacuate' },
    };
    const next = stepAtmosphere(input({ compartments: start, setpoints }));
    const still = stepAtmosphere(
      input({ compartments: start, setpoints: ALL_OFF }),
    );
    expect(next.compartments).toEqual(still.compartments);
    expect(lifeSupportDemand(start, ROOMS, setpoints, ratings)).toBeCloseTo(
      34_166.67,
      2,
    );
  });
});

describe('a shed tick', () => {
  const setpoints: LifeSupportSetpoints = {
    ...ONLINE,
    vents: { airlock: true },
    pumps: { airlock: 'evacuate' },
  };

  it('runs no device and no pump, and still vents', () => {
    const start = initial();
    start.habitat = air(101_300, 290, 120);
    const shed = stepAtmosphere(
      input({ compartments: start, setpoints, shed: true }),
    );
    const metabolism = stepAtmosphere(
      input({
        compartments: start,
        setpoints: { ...ALL_OFF, vents: { airlock: false } },
      }),
    ).compartments;
    expect(shed.lifeSupport.heaters).toEqual({ bridge: 0, habitat: 0 });
    for (const id of ['bridge', 'habitat', 'reactor-bay']) {
      expect(shed.compartments[id]).toEqual(metabolism[id]);
    }
    const fraction = ventFraction(ratings.vent.area, 12, dt);
    for (const gas of GASES) {
      expect(shed.compartments.airlock.moles[gas]).toBeCloseTo(
        metabolism.airlock.moles[gas] * fraction,
        12,
      );
    }
  });

  it('heats on a powered tick', () => {
    const start = initial();
    start.habitat = air(101_300, 290, 120);
    const powered = stepAtmosphere(input({ compartments: start, setpoints }));
    const shed = stepAtmosphere(
      input({ compartments: start, setpoints, shed: true }),
    );
    expect(powered.lifeSupport.heaters.habitat).toBe(10_000);
    expect(powered.compartments.habitat.temperature).toBeGreaterThan(
      shed.compartments.habitat.temperature,
    );
  });

  it('pumps the airlock into the habitat on a powered tick', () => {
    const start = initial();
    const pumping = { ...ALL_OFF, pumps: { airlock: 'evacuate' as const } };
    const pumped = stepAtmosphere(
      input({ compartments: start, setpoints: pumping }),
    ).compartments;
    const still = stepAtmosphere(
      input({ compartments: start, setpoints: ALL_OFF }),
    ).compartments;
    const moved =
      totalMoles(still.airlock.moles) * pumpFraction(12, ratings.pump, dt);
    expect(
      totalMoles(pumped.habitat.moles) - totalMoles(still.habitat.moles),
    ).toBeCloseTo(moved, 9);
    expect(
      totalMoles(still.airlock.moles) - totalMoles(pumped.airlock.moles),
    ).toBeCloseTo(moved, 9);
  });
});

describe('offline life support', () => {
  it('leaves every compartment as it was', () => {
    const start = initial();
    const result = stepAtmosphere(
      input({
        compartments: start,
        setpoints: {
          ...ONLINE,
          online: false,
          vents: { airlock: true },
          pumps: { airlock: 'evacuate' },
        },
      }),
    );
    expect(result.compartments).toEqual(start);
    expect(result.lifeSupport.heaters).toEqual({ bridge: 0, habitat: 0 });
  });
});
