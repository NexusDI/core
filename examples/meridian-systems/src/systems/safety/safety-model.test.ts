import { describe, expect, it, vi } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { doorFractions } from '../../physics/doors';
import {
  AIR,
  exchange,
  GASES,
  molesAt,
  pressure,
  totalMoles,
  vent,
  ventFraction,
  type Air,
  type Gas,
} from '../../physics/gas';
import { LITHIUM_LOOP } from '../engineering/engineering-model';
import type { AtmosphereReading } from '../life-support/contracts';

import type { Alarm, SafetyRecord, SafetySetpoints } from './contracts';
import {
  burns,
  FIRE,
  FLOOD,
  stepFire,
  stepSafety,
  type SafetyInput,
} from './safety-model';

const dt = 0.5;
const rooms = deck.compartments;
const ids = rooms.map((plan) => plan.id);
const charges: Record<string, number> = Object.fromEntries(
  rooms.flatMap((plan) =>
    'floodCharge' in plan && plan.floodCharge !== undefined
      ? [[plan.id, plan.floodCharge]]
      : [],
  ),
);
const doorIds = deck.doors.map((door) => door.id);

function room(id: string) {
  const plan = rooms.find((entry) => entry.id === id);
  if (!plan) throw new Error(`The deck has no room '${id}'.`);
  return plan;
}

function door(id: string) {
  const plan = deck.doors.find((entry) => entry.id === id);
  if (!plan) throw new Error(`The deck has no door '${id}'.`);
  return plan;
}

/** A room of the deck at `pa` and `temperature`, filled with ship air. */
function air(id: string, pa = 101_300, temperature = 293): Air {
  return {
    moles: molesAt(pa, temperature, room(id).volume, AIR),
    temperature,
  };
}

/** Every room at the deck's initial air, and the two vacuum bays empty. */
const initial = (): Record<string, Air> =>
  Object.fromEntries(
    rooms.map((plan) => [
      plan.id,
      air(plan.id, 'pressurised' in plan && !plan.pressurised ? 0 : 101_300),
    ]),
  );

/** What a reading may override: the total pressure, the temperature and two partials. */
interface Override {
  readonly pressure?: number;
  readonly temperature?: number;
  readonly O2?: number;
  readonly CO2?: number;
}

/**
 * A noiseless analyzer: the true values of `air`, with `overrides` keyed by
 * `<room>:<tick>` replacing single fields.
 */
function analyzer(overrides: Readonly<Record<string, Override>> = {}) {
  return (id: string, state: Air, tick: number): AtmosphereReading => {
    const { volume } = room(id);
    const partial = {} as Record<Gas, number>;
    for (const gas of GASES)
      partial[gas] = pressure(state.moles[gas], state.temperature, volume);
    const override = overrides[`${id}:${tick}`] ?? {};
    return {
      compartment: id,
      tick,
      temperature: override.temperature ?? state.temperature,
      pressure:
        override.pressure ??
        pressure(totalMoles(state.moles), state.temperature, volume),
      partial: {
        ...partial,
        O2: override.O2 ?? partial.O2,
        CO2: override.CO2 ?? partial.CO2,
      },
    };
  };
}

const shut = (): Record<string, boolean> =>
  Object.fromEntries(doorIds.map((id) => [id, false]));
const charged = (value: boolean): Record<string, boolean> =>
  Object.fromEntries(Object.keys(charges).map((id) => [id, value]));

function setpoints(
  change: Partial<SafetySetpoints> = {},
): SafetySetpoints<string, string> {
  return {
    doors: { ...shut(), ...change.doors },
    floods: { ...charged(false), ...change.floods },
    drills: { ...charged(false), ...change.drills },
  };
}

function record(change: Partial<SafetyRecord> = {}): SafetyRecord {
  return {
    fires: { ...Object.fromEntries(ids.map((id) => [id, 0])), ...change.fires },
    flooded: {
      ...Object.fromEntries(Object.keys(charges).map((id) => [id, 0])),
      ...change.flooded,
    },
    alarms: change.alarms ?? [],
  };
}

/** A quiet tick 5 of the seeded ship, with `change` laid over it. */
function input(change: Partial<SafetyInput> = {}): SafetyInput {
  const compartments = change.compartments ?? initial();
  return {
    ids,
    start: { compartments, alarms: [] },
    compartments,
    rooms,
    doors: deck.doors,
    setpoints: setpoints(),
    record: record(),
    engineering: { coolant: 500, tripped: false, shed: [] },
    read: analyzer(),
    draw: () => 0.99,
    tick: 5,
    dt,
    ...change,
  };
}

const key = (alarm: Alarm) => `${alarm.code} ${alarm.subject}`;
const alarms = (change: Partial<SafetyInput>) =>
  stepSafety(input(change)).safety.alarms.map(key);
/**
 * The habitat's reading at the end of tick 5, after a start-of-tick read of
 * `from` Pa at tick 4.
 */
const habitatNow = (override: Override, from = 101_300) =>
  analyzer({ 'habitat:4': { pressure: from }, 'habitat:5': override });
const active = (...list: Alarm[]) => ({
  compartments: initial(),
  alarms: list,
});

describe('a quiet tick', () => {
  it('returns the incoming compartments and setpoints and never draws', () => {
    const draw = vi.fn(() => 0.99);
    const given = input({ draw });
    const result = stepSafety(given);
    expect(result.compartments).toBe(given.compartments);
    expect(result.setpoints).toBe(given.setpoints);
    expect(draw).not.toHaveBeenCalled();
    expect(result.safety).toEqual(record());
  });

  it('returns the incoming compartments when a fire goes out this tick', () => {
    const given = input({ record: record({ fires: { habitat: 0.009 } }) });
    const fuel = {
      ...given.compartments,
      habitat: {
        moles: { ...air('habitat').moles, N2: air('habitat').moles.N2 + 2_000 },
        temperature: 293,
      },
    };
    const result = stepSafety({ ...given, compartments: fuel });
    expect(result.compartments).toBe(fuel);
    expect(result.safety.fires.habitat).toBe(0);
  });
});

describe('the doors', () => {
  it('trades gas through an open door with the door fractions', () => {
    const compartments: Record<string, Air> = {
      ...initial(),
      habitat: air('habitat', 50_000),
    };
    const result = stepSafety(
      input({
        compartments,
        setpoints: setpoints({ doors: { 'bridge-habitat': true } }),
      }),
    );
    const { fromA, fromB } = doorFractions(
      door('bridge-habitat').area,
      60,
      120,
      dt,
    );
    const expected = exchange(
      compartments.bridge,
      compartments.habitat,
      room('bridge').structureHeatCapacity,
      room('habitat').structureHeatCapacity,
      fromA,
      fromB,
    );
    expect(result.compartments.bridge).toEqual(expected.a);
    expect(result.compartments.habitat).toEqual(expected.b);
    expect(result.compartments['reactor-bay']).toBe(
      compartments['reactor-bay'],
    );
  });

  it('runs the doors in deck order, each from the air the last door left', () => {
    const compartments: Record<string, Air> = {
      ...initial(),
      habitat: air('habitat', 50_000),
    };
    const result = stepSafety(
      input({
        compartments,
        setpoints: setpoints({
          doors: { 'bridge-habitat': true, 'habitat-engineering': true },
        }),
      }),
    );
    const first = doorFractions(door('bridge-habitat').area, 60, 120, dt);
    const one = exchange(
      compartments.bridge,
      compartments.habitat,
      room('bridge').structureHeatCapacity,
      room('habitat').structureHeatCapacity,
      first.fromA,
      first.fromB,
    );
    const second = doorFractions(door('habitat-engineering').area, 120, 90, dt);
    const two = exchange(
      one.b,
      compartments.engineering,
      room('habitat').structureHeatCapacity,
      room('engineering').structureHeatCapacity,
      second.fromA,
      second.fromB,
    );
    expect(result.compartments.bridge).toEqual(one.a);
    expect(result.compartments.habitat).toEqual(two.a);
    expect(result.compartments.engineering).toEqual(two.b);
  });

  it('vents the airlock through the outer door, keeping 0.00193 a tick', () => {
    const result = stepSafety(
      input({ setpoints: setpoints({ doors: { 'airlock-outer': true } }) }),
    );
    const kept = ventFraction(door('airlock-outer').area, 12, dt);
    expect(kept).toBeCloseTo(0.00193045, 8);
    expect(result.compartments.airlock).toEqual(vent(initial().airlock, kept));
  });
});

describe('the fires', () => {
  it('lights a drill at 0.05 with no draw and resets every drill flag', () => {
    const draw = vi.fn(() => 0);
    const result = stepSafety(
      input({ draw, setpoints: setpoints({ drills: { habitat: true } }) }),
    );
    expect(result.safety.fires.habitat).toBe(FIRE.start);
    expect(result.safety.alarms).toEqual([
      { code: 'FIRE', subject: 'habitat' },
    ]);
    expect(result.setpoints.drills).toEqual(charged(false));
    expect(draw).not.toHaveBeenCalled();
  });

  it('resets a drill flag on a flooded room that lights nothing', () => {
    const flooded = {
      ...initial(),
      habitat: {
        moles: { ...air('habitat').moles, N2: air('habitat').moles.N2 + 2_000 },
        temperature: 293,
      },
    };
    const given = input({
      compartments: flooded,
      setpoints: setpoints({ drills: { habitat: true } }),
    });
    const result = stepSafety(given);
    expect(result.safety.fires.habitat).toBe(0);
    expect(result.setpoints.drills).toEqual(charged(false));
    expect(result.compartments).toBe(flooded);
  });

  it('leaves a burning room on its fire law when a drill comes', () => {
    const burning = record({ fires: { habitat: 0.5 } });
    const drilled = stepSafety(
      input({
        record: burning,
        setpoints: setpoints({ drills: { habitat: true } }),
      }),
    );
    const plain = stepSafety(input({ record: burning }));
    expect(drilled.safety.fires.habitat).toBe(0.5 + FIRE.growth * dt);
    expect(drilled.compartments).toEqual(plain.compartments);
  });

  it('draws once for each room above 330 K, in compartment order', () => {
    const hot = {
      ...initial(),
      bridge: air('bridge', 101_300, 340),
      habitat: air('habitat', 101_300, 340),
    };
    // The bridge draws first and stays dark; the habitat lights.
    const draw = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0);
    const result = stepSafety(input({ compartments: hot, draw }));
    expect(draw).toHaveBeenCalledTimes(2);
    expect(result.safety.fires.bridge).toBe(0);
    expect(result.safety.fires.habitat).toBe(FIRE.start);
  });
});

describe('the floods', () => {
  it('releases charge / 20 a tick at the room temperature', () => {
    const result = stepSafety(
      input({ setpoints: setpoints({ floods: { habitat: true } }) }),
    );
    expect(result.compartments.habitat.moles.N2).toBe(
      initial().habitat.moles.N2 + 100,
    );
    expect(result.compartments.habitat.temperature).toBe(293);
    expect(result.safety.flooded.habitat).toBe(100);
    expect(result.setpoints.floods.habitat).toBe(true);
  });

  it.each([
    ['bridge', 50],
    ['habitat', 100],
    ['reactor-bay', 66.5],
    ['chart-room', 20],
    ['computer-core', 16.5],
    ['quarters', 40],
    ['comms-relay', 13.5],
    ['capacitor-room', 30],
    ['engineering', 75],
    ['ftl-core', 41.5],
    ['main-drive', 33.5],
  ])(
    'finishes the %s flood of %s mol a tick on its 20th tick',
    (id, perTick) => {
      let given = input({ setpoints: setpoints({ floods: { [id]: true } }) });
      const before = given.compartments[id].moles.N2;
      for (let tick = 1; tick <= 20; tick++) {
        const result = stepSafety(given);
        expect(result.setpoints.floods[id]).toBe(tick < 20);
        expect(result.safety.flooded[id]).toBe(tick < 20 ? tick * perTick : 0);
        given = {
          ...given,
          compartments: result.compartments,
          record: result.safety,
          setpoints: result.setpoints,
        };
      }
      expect(given.compartments[id].moles.N2 - before).toBeCloseTo(
        charges[id],
        9,
      );
    },
  );
});

describe('the alarms', () => {
  it.each([
    ['HYPOXIA', { O2: 15_999 }, { O2: 16_000 }],
    ['CO2_HIGH', { CO2: 1_001 }, { CO2: 1_000 }],
    ['PRESSURE_LOW', { pressure: 69_999 }, { pressure: 70_000 }, 70_000],
    ['TEMPERATURE', { temperature: 303.01 }, { temperature: 303 }],
    ['TEMPERATURE', { temperature: 282.99 }, { temperature: 283 }],
    // dP/dt from 101,300 Pa at the start of the tick over 0.5 s.
    ['DECOMPRESSION', { pressure: 100_299 }, { pressure: 100_300 }],
  ] as const)(
    'raises %s past its limit and not at it',
    (code, past, at, from?: number) => {
      expect(alarms({ read: habitatNow(past, from) })).toEqual([
        `${code} habitat`,
      ]);
      expect(alarms({ read: habitatNow(at, from) })).toEqual([]);
    },
  );

  it('raises FIRE while a fire burns', () => {
    expect(alarms({ record: record({ fires: { airlock: 0.5 } }) })).toEqual([
      'FIRE airlock',
    ]);
  });

  it('raises the engineering alarms from their records', () => {
    const limit = LITHIUM_LOOP.alarm;
    expect(
      alarms({ engineering: { coolant: limit, tripped: false, shed: [] } }),
    ).toEqual([]);
    expect(
      alarms({
        engineering: {
          coolant: limit + 0.01,
          tripped: true,
          shed: ['life-support', 'galley'],
        },
      }),
    ).toEqual([
      'COOLANT_HIGH reactor',
      'REACTOR_TRIP reactor',
      'LOAD_SHED life-support',
      'LOAD_SHED galley',
    ]);
  });

  it('raises the atmosphere alarms in occupied rooms only', () => {
    const bad: Override = {
      O2: 1_000,
      CO2: 5_000,
      pressure: 10_000,
      temperature: 400,
    };
    expect(
      alarms({
        read: analyzer({ 'reactor-bay:5': bad, 'airlock:5': bad }),
      }),
    ).toEqual([]);
    expect(alarms({ read: analyzer({ 'bridge:5': bad }) })).toEqual([
      'HYPOXIA bridge',
      'CO2_HIGH bridge',
      'PRESSURE_LOW bridge',
      'TEMPERATURE bridge',
      'DECOMPRESSION bridge',
    ]);
  });

  it.each([
    ['the end-of-step read', 5],
    ['the start-of-tick read', 4],
  ])('raises FIRE beside SENSOR_FAULT when %s throws', (_, failing) => {
    const truth = analyzer({ 'habitat:5': { O2: 1_000 } });
    const read = (id: string, state: Air, tick: number) => {
      if (id === 'habitat' && tick === failing) throw new Error('no reading');
      return truth(id, state, tick);
    };
    expect(
      alarms({ read, record: record({ fires: { habitat: 0.5 } }) }),
    ).toEqual(['FIRE habitat', 'SENSOR_FAULT habitat']);
  });

  it('raises SENSOR_FAULT alone in an unoccupied room whose read throws', () => {
    const truth = analyzer();
    const read = (id: string, state: Air, tick: number) => {
      if (id === 'airlock') throw new Error('no reading');
      return truth(id, state, tick);
    };
    expect(alarms({ read })).toEqual(['SENSOR_FAULT airlock']);
  });

  it('lists the alarms room by room, then the engineering alarms', () => {
    const read = analyzer({
      'bridge:5': { CO2: 2_000, temperature: 310 },
      'habitat:5': { O2: 10_000, pressure: 60_000 },
    });
    expect(
      alarms({
        read,
        record: record({ fires: { habitat: 0.5, airlock: 0.5 } }),
        engineering: { coolant: 1_400, tripped: true, shed: ['life-support'] },
      }),
    ).toEqual([
      'CO2_HIGH bridge',
      'TEMPERATURE bridge',
      'FIRE habitat',
      'HYPOXIA habitat',
      'PRESSURE_LOW habitat',
      'DECOMPRESSION habitat',
      'FIRE airlock',
      'COOLANT_HIGH reactor',
      'REACTOR_TRIP reactor',
      'LOAD_SHED life-support',
    ]);
  });
});

describe('the deadband', () => {
  // Each row: the alarm, a reading between its limits, and one past its clear limit.
  it.each([
    ['HYPOXIA', { O2: 16_499 }, { O2: 16_500 }],
    ['CO2_HIGH', { CO2: 951 }, { CO2: 950 }],
    ['PRESSURE_LOW', { pressure: 71_999 }, { pressure: 72_000 }, 72_000],
    ['TEMPERATURE', { temperature: 302.51 }, { temperature: 302.5 }],
    ['TEMPERATURE', { temperature: 283.49 }, { temperature: 283.5 }],
    // dP/dt of −1,002 and −1,000 Pa/s from 101,300 Pa.
    ['DECOMPRESSION', { pressure: 100_799 }, { pressure: 100_800 }],
  ] as const)(
    'keeps an active %s between its limits and clears it past the second',
    (code, between, cleared, from?: number) => {
      const start = active({ code, subject: 'habitat' });
      expect(alarms({ start, read: habitatNow(between, from) })).toEqual([
        `${code} habitat`,
      ]);
      expect(alarms({ read: habitatNow(between, from) })).toEqual([]);
      expect(alarms({ start, read: habitatNow(cleared, from) })).toEqual([]);
    },
  );

  it('keeps no other room or code active from the previous set', () => {
    const start = active({ code: 'HYPOXIA', subject: 'bridge' });
    expect(alarms({ start, read: habitatNow({ O2: 16_499 }) })).toEqual([]);
  });
});

describe('a decompression', () => {
  const open = () =>
    setpoints({
      doors: Object.fromEntries(doorIds.map((id) => [id, true])),
    });
  // The analyzer reads the start air at tick 4 and the end air at tick 5.
  const falling = (pa: number) =>
    analyzer({
      'habitat:4': { pressure: 101_300 },
      'habitat:5': { pressure: pa },
    });

  it('shuts exactly the doors of the room', () => {
    const result = stepSafety(
      input({ setpoints: open(), read: falling(99_000) }),
    );
    expect(result.safety.alarms.map(key)).toEqual(['DECOMPRESSION habitat']);
    expect(
      Object.entries(result.setpoints.doors)
        .filter(([, open]) => !open)
        .map(([id]) => id),
    ).toEqual([
      'bridge-habitat',
      'habitat-airlock',
      'habitat-quarters',
      'habitat-comms-relay',
      'habitat-engineering',
    ]);
  });

  it('shuts them again on every tick it stays active', () => {
    const result = stepSafety(
      input({
        setpoints: open(),
        start: active({ code: 'DECOMPRESSION', subject: 'habitat' }),
        read: falling(100_500),
      }),
    );
    expect(result.safety.alarms.map(key)).toEqual(['DECOMPRESSION habitat']);
    expect(result.setpoints.doors['habitat-airlock']).toBe(false);
    expect(result.setpoints.doors['airlock-outer']).toBe(true);
  });
});

const habitat = deck.compartments[1];
const habitatAir: Air = {
  moles: molesAt(101_300, 293, habitat.volume, AIR),
  temperature: 293,
};

/** The habitat after `mol` of a flood's N₂ at the room's temperature. */
function flooded(air: Air, mol: number): Air {
  return {
    moles: { ...air.moles, N2: air.moles.N2 + mol },
    temperature: air.temperature,
  };
}

/** Never lights a fire: every draw sits above the ignition chance. */
const never = () => 0.99;

describe('the fuel conditions', () => {
  it('lets the initial habitat burn', () => {
    expect(burns(habitatAir, habitat.volume)).toBe(true);
  });

  it('stops a fire after a 2,000 mol flood at 14.99 % O2 and 141.9 kPa', () => {
    const air = flooded(habitatAir, 2_000);
    const total = totalMoles(air.moles);
    expect((100 * air.moles.O2) / total).toBeCloseTo(14.99, 2);
    expect(pressure(total, 293, habitat.volume)).toBeCloseTo(141_900, -2);
    expect(pressure(air.moles.O2, 293, habitat.volume)).toBeCloseTo(21_270, -1);
    expect(burns(air, habitat.volume)).toBe(false);
  });

  it('stops a fire at a total of 75 kPa, where p_O2 is 15.75 kPa', () => {
    const air: Air = {
      moles: molesAt(75_000, 293, habitat.volume, AIR),
      temperature: 293,
    };
    expect(pressure(air.moles.O2, 293, habitat.volume)).toBeCloseTo(15_750, 6);
    expect(burns(air, habitat.volume)).toBe(false);
  });

  it('lets no fire burn in an empty room', () => {
    const empty: Air = {
      moles: molesAt(0, 293, habitat.volume, AIR),
      temperature: 293,
    };
    expect(burns(empty, habitat.volume)).toBe(false);
  });
});

describe('the fire law', () => {
  it('grows from 0.05 to 1 in 38 ticks', () => {
    let air = habitatAir;
    let intensity: number = FIRE.start;
    let ticks = 0;
    while (intensity < 1) {
      ({ air, intensity } = stepFire(
        air,
        habitat,
        intensity,
        dt,
        never,
        false,
      ));
      ticks += 1;
    }
    expect(ticks).toBe(38);
  });

  it('decays from 1 to under 0.01 in 47 ticks once the room cannot burn', () => {
    let air = flooded(habitatAir, 2_000);
    let intensity = 1;
    let ticks = 0;
    while (intensity > 0) {
      ({ air, intensity } = stepFire(
        air,
        habitat,
        intensity,
        dt,
        never,
        false,
      ));
      ticks += 1;
    }
    expect(ticks).toBe(47);
  });

  it('runs a forced ignition in a habitat with its 293 K moles at 340 K', () => {
    let air: Air = { moles: habitatAir.moles, temperature: 340 };
    expect(pressure(totalMoles(air.moles), 340, habitat.volume)).toBeCloseTo(
      117_549,
      -1,
    );
    const oxygen = air.moles.O2;
    const draws = [0];
    const draw = () => draws.shift() ?? 0.99;
    let intensity = 0;
    let full = 0;
    let starved = 0;
    let out = 0;
    let peak = 0;
    for (let tick = 1; out === 0 && tick <= 2_000; tick += 1) {
      ({ air, intensity } = stepFire(air, habitat, intensity, dt, draw, false));
      if (tick === 1) expect(intensity).toBe(FIRE.start);
      if (full === 0 && intensity === 1) full = tick;
      if (starved === 0 && !burns(air, habitat.volume)) starved = tick;
      if (tick > 1 && intensity === 0) out = tick;
      peak = Math.max(peak, air.temperature);
    }
    expect(full).toBe(39);
    expect(Math.abs(starved - 986)).toBeLessThanOrEqual(1);
    expect(Math.abs(out - 1_033)).toBeLessThanOrEqual(1);
    expect(Math.abs(peak - 363.79)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(oxygen - air.moles.O2 - 244.2)).toBeLessThanOrEqual(0.1);
  });

  it('puts a full fire out at tick 63 under a flood from the next tick', () => {
    let air: Air = { moles: habitatAir.moles, temperature: 340 };
    let intensity = 1;
    let released = 0;
    let starved = 0;
    let out = 0;
    const charge = 2_000;
    const share = charge / (FLOOD.seconds / dt);
    for (let tick = 1; out === 0 && tick <= 200; tick += 1) {
      ({ air, intensity } = stepFire(
        air,
        habitat,
        intensity,
        dt,
        never,
        false,
      ));
      if (released < charge) {
        air = flooded(air, share);
        released += share;
      }
      if (starved === 0 && !burns(air, habitat.volume)) starved = tick;
      if (intensity === 0) out = tick;
    }
    expect(starved).toBe(16);
    expect(Math.abs(out - 63)).toBeLessThanOrEqual(1);
  });

  it('burns 0.5 mol of O2 a second at full intensity, with 0.4 of CO2 and 0.2 of H2O', () => {
    const { air } = stepFire(habitatAir, habitat, 1, dt, never, false);
    expect(habitatAir.moles.O2 - air.moles.O2).toBeCloseTo(0.25, 12);
    expect(air.moles.CO2 - habitatAir.moles.CO2).toBeCloseTo(0.2, 12);
    expect(air.moles.H2O - habitatAir.moles.H2O).toBeCloseTo(0.1, 12);
    expect(air.moles.N2).toBe(habitatAir.moles.N2);
  });
});

describe('ignition', () => {
  it('draws once in an eligible room and lights under the chance 1 − exp(−λ · dt)', () => {
    const hot: Air = { moles: habitatAir.moles, temperature: 340 };
    const chance = 1 - Math.exp(-FIRE.lambda * dt);
    expect(chance).toBeCloseTo(4.9988e-4, 8);
    const below = vi.fn(() => chance * 0.999);
    expect(stepFire(hot, habitat, 0, dt, below, false).intensity).toBe(
      FIRE.start,
    );
    expect(below).toHaveBeenCalledTimes(1);
    const above = vi.fn(() => chance);
    const result = stepFire(hot, habitat, 0, dt, above, false);
    expect(result.intensity).toBe(0);
    expect(result.air).toBe(hot);
    expect(above).toHaveBeenCalledTimes(1);
  });

  it.each([330, 293])('draws nothing in a room at %s K', (temperature) => {
    const air: Air = { moles: habitatAir.moles, temperature };
    const draw = vi.fn(() => 0);
    const result = stepFire(air, habitat, 0, dt, draw, false);
    expect(result.intensity).toBe(0);
    expect(result.air).toBe(air);
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws nothing in a hot room that cannot burn', () => {
    const air: Air = { ...flooded(habitatAir, 2_000), temperature: 340 };
    const draw = vi.fn(() => 0);
    expect(stepFire(air, habitat, 0, dt, draw, false).intensity).toBe(0);
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws nothing for a room that already burns', () => {
    const hot: Air = { moles: habitatAir.moles, temperature: 340 };
    const draw = vi.fn(() => 0);
    stepFire(hot, habitat, 0.5, dt, draw, false);
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('the drill', () => {
  it('lights 0.05 in the habitat at 293 K with no draw', () => {
    const draw = vi.fn(() => 0);
    const result = stepFire(habitatAir, habitat, 0, dt, draw, true);
    expect(result.intensity).toBe(FIRE.start);
    expect(result.air.moles.O2).toBeLessThan(habitatAir.moles.O2);
    expect(draw).not.toHaveBeenCalled();
  });

  it('lights nothing after a 2,000 mol flood', () => {
    const air = flooded(habitatAir, 2_000);
    const result = stepFire(air, habitat, 0, dt, never, true);
    expect(result.intensity).toBe(0);
    expect(result.air).toBe(air);
  });

  it('leaves a burning room to the fire law', () => {
    const drill = stepFire(habitatAir, habitat, 0.5, dt, never, true);
    const fire = stepFire(habitatAir, habitat, 0.5, dt, never, false);
    expect(drill).toEqual(fire);
  });
});

describe('the ratings', () => {
  it('holds the fire law and the flood time of the spec', () => {
    expect(FIRE).toEqual({
      ignition: 330,
      lambda: 1e-3,
      growth: 0.05,
      decay: 0.2,
      out: 0.01,
      start: 0.05,
      burn: { O2: 0.5, CO2: 0.4, H2O: 0.2 },
      energy: 400_000,
      oxygen: { fraction: 0.16, partial: 16_000 },
    });
    expect(FLOOD).toEqual({ seconds: 10 });
  });
});
