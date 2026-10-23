import { describe, expect, it } from 'vitest';
import {
  LIFE_SUPPORT_RATINGS,
  stepAtmosphere,
  type AtmosphereInput,
  type AtmosphereResult,
  type LifeSupportSetpoints,
  type RoomPlan,
} from './atmosphere';
import { AIR, molesAt, type Air } from './gas';
import {
  FUSION_REACTOR,
  LITHIUM_LOOP,
  louvre,
  pulseCoolant,
  stepCoolant,
  stepReactor,
  tripped,
  type CoolantRecord,
  type ReactorRecord,
} from './thermal';

const dt = 0.5;
const cold: ReactorRecord = {
  level: 0,
  thermal: 0,
  electric: 0,
  tripped: false,
};
const standby: CoolantRecord = { temperature: 500 };

describe('the fusion reactor', () => {
  it('ramps from 0 to full in 100 steps of 0.01', () => {
    let reactor = cold;
    for (let i = 0; i < 100; i++) {
      const next = stepReactor(reactor, 1, FUSION_REACTOR, dt);
      expect(next.level - reactor.level).toBeLessThanOrEqual(0.01 + 1e-12);
      reactor = next;
    }
    expect(reactor.level).toBe(1);
  });

  it('stops the level at a throttle of 0.3', () => {
    let reactor = cold;
    for (let i = 0; i < 100; i++) {
      reactor = stepReactor(reactor, 0.3, FUSION_REACTOR, dt);
    }
    expect(reactor.level).toBe(0.3);
  });

  it('puts out 3.63 GW of heat and 1.21 GW of electricity at full', () => {
    const full = stepReactor({ ...cold, level: 1 }, 1, FUSION_REACTOR, dt);
    expect(full.thermal).toBe(3.63e9);
    expect(full.electric).toBe(1.21e9);
  });

  it('leaves the trip flag as it found it', () => {
    expect(
      stepReactor({ ...cold, tripped: true }, 1, FUSION_REACTOR, dt).tripped,
    ).toBe(true);
    expect(stepReactor(cold, 1, FUSION_REACTOR, dt).tripped).toBe(false);
  });
});

describe('the radiator louvres', () => {
  it('stay shut at and below 500 K and open fully from 550 K', () => {
    expect(louvre(450, LITHIUM_LOOP)).toBe(0);
    expect(louvre(500, LITHIUM_LOOP)).toBe(0);
    expect(louvre(525, LITHIUM_LOOP)).toBe(0.5);
    expect(louvre(550, LITHIUM_LOOP)).toBe(1);
    expect(louvre(1_200, LITHIUM_LOOP)).toBe(1);
  });
});

describe('the lithium coolant loop', () => {
  it('holds 500 K exactly for 600 steps with no heat', () => {
    let coolant = standby;
    for (let i = 0; i < 600; i++) {
      coolant = stepCoolant(coolant, 0, LITHIUM_LOOP, dt);
      expect(coolant.temperature).toBe(500);
    }
  });

  it('settles at 1,186 K under the full-output heat and never overshoots', () => {
    const heat =
      FUSION_REACTOR.thermal -
      FUSION_REACTOR.efficiency * FUSION_REACTOR.thermal;
    let coolant = standby;
    let hottest = coolant.temperature;
    for (let i = 0; i < 20_000; i++) {
      coolant = stepCoolant(coolant, heat, LITHIUM_LOOP, dt);
      hottest = Math.max(hottest, coolant.temperature);
    }
    expect(Math.abs(coolant.temperature - 1_186)).toBeLessThanOrEqual(5);
    expect(hottest).toBeLessThanOrEqual(1_191);
  });

  it('trips the reactor from 1,450 K', () => {
    expect(tripped({ temperature: 1_449.9 }, LITHIUM_LOOP)).toBe(false);
    expect(tripped({ temperature: 1_450 }, LITHIUM_LOOP)).toBe(true);
  });

  it('raises 500 K to 500.08992805755395 K with a pulse of 75,000,000 J', () => {
    expect(pulseCoolant(standby, 75_000_000, LITHIUM_LOOP)).toEqual({
      temperature: 500.08992805755395,
    });
  });
});

describe('the thermostats', () => {
  const rooms: readonly RoomPlan[] = [
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
  ];
  const setpoints: LifeSupportSetpoints = {
    online: true,
    heaters: {
      bridge: { on: true, target: 293 },
      habitat: { on: true, target: 293 },
    },
    scrubbers: { bridge: true, habitat: true },
    oxygen: { bridge: true, habitat: true },
    vents: {},
    pumps: {},
  };
  const start = (volume: number): Air => ({
    moles: molesAt(101_300, 293, volume, AIR),
    temperature: 293,
  });

  /** An hour of the bridge and the habitat from 293 K, tick by tick. */
  function hour(
    visit: (tick: number, result: AtmosphereResult) => void = () => undefined,
  ): AtmosphereResult {
    const step: AtmosphereInput = {
      compartments: { bridge: start(60), habitat: start(120) },
      rooms,
      setpoints,
      coolantTemperature: 500,
      shed: false,
      dt,
      ratings: LIFE_SUPPORT_RATINGS,
    };
    let result = stepAtmosphere(step);
    visit(1, result);
    for (let tick = 2; tick <= 7_200; tick++) {
      result = stepAtmosphere({ ...step, compartments: result.compartments });
      visit(tick, result);
    }
    return result;
  }

  it('holds the habitat between 292.4 K and 292.7 K from tick 2,400', () => {
    hour((tick, { compartments }) => {
      if (tick < 2_400) return;
      expect(compartments.habitat.temperature).toBeGreaterThan(292.4);
      expect(compartments.habitat.temperature).toBeLessThan(292.7);
    });
  });

  it('settles the bridge at 292.726 K on 2,745 W', () => {
    const end = hour();
    expect(
      Math.abs(end.compartments.bridge.temperature - 292.726),
    ).toBeLessThanOrEqual(0.05);
    expect(
      Math.abs((end.lifeSupport.heaters.bridge ?? 0) - 2_745),
    ).toBeLessThanOrEqual(5);
  });
});
