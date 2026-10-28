import { describe, expect, it, vi } from 'vitest';

import deck from '../../deck/meridian.deck.json';

import { burns, FIRE, FLOOD, stepFire } from './fire';
import { AIR, molesAt, pressure, totalMoles, type Air } from './gas';

const dt = 0.5;
const habitat = deck.compartments[1];
const initial: Air = {
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
    expect(burns(initial, habitat.volume)).toBe(true);
  });

  it('stops a fire after a 2,000 mol flood at 14.99 % O2 and 141.9 kPa', () => {
    const air = flooded(initial, 2_000);
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
});

describe('the fire law', () => {
  it('grows from 0.05 to 1 in 38 ticks', () => {
    let air = initial;
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
    let air = flooded(initial, 2_000);
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
    let air: Air = { moles: initial.moles, temperature: 340 };
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
    let air: Air = { moles: initial.moles, temperature: 340 };
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
    const { air } = stepFire(initial, habitat, 1, dt, never, false);
    expect(initial.moles.O2 - air.moles.O2).toBeCloseTo(0.25, 12);
    expect(air.moles.CO2 - initial.moles.CO2).toBeCloseTo(0.2, 12);
    expect(air.moles.H2O - initial.moles.H2O).toBeCloseTo(0.1, 12);
    expect(air.moles.N2).toBe(initial.moles.N2);
  });
});

describe('ignition', () => {
  it('draws once in an eligible room and lights under the chance 1 − exp(−λ · dt)', () => {
    const hot: Air = { moles: initial.moles, temperature: 340 };
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
    const air: Air = { moles: initial.moles, temperature };
    const draw = vi.fn(() => 0);
    const result = stepFire(air, habitat, 0, dt, draw, false);
    expect(result.intensity).toBe(0);
    expect(result.air).toBe(air);
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws nothing in a hot room that cannot burn', () => {
    const air: Air = { ...flooded(initial, 2_000), temperature: 340 };
    const draw = vi.fn(() => 0);
    expect(stepFire(air, habitat, 0, dt, draw, false).intensity).toBe(0);
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws nothing for a room that already burns', () => {
    const hot: Air = { moles: initial.moles, temperature: 340 };
    const draw = vi.fn(() => 0);
    stepFire(hot, habitat, 0.5, dt, draw, false);
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('the drill', () => {
  it('lights 0.05 in the habitat at 293 K with no draw', () => {
    const draw = vi.fn(() => 0);
    const result = stepFire(initial, habitat, 0, dt, draw, true);
    expect(result.intensity).toBe(FIRE.start);
    expect(result.air.moles.O2).toBeLessThan(initial.moles.O2);
    expect(draw).not.toHaveBeenCalled();
  });

  it('lights nothing after a 2,000 mol flood', () => {
    const air = flooded(initial, 2_000);
    const result = stepFire(air, habitat, 0, dt, never, true);
    expect(result.intensity).toBe(0);
    expect(result.air).toBe(air);
  });

  it('leaves a burning room to the fire law', () => {
    const drill = stepFire(initial, habitat, 0.5, dt, never, true);
    const fire = stepFire(initial, habitat, 0.5, dt, never, false);
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
