import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';

import { doorFractions, doorPressures, PRESSURE_INTERLOCK } from './doors';
import {
  AIR,
  exchange,
  GASES,
  heatCapacity,
  molesAt,
  pressure,
  totalMoles,
  type Air,
} from './gas';

const dt = 0.5;

function room(id: string) {
  const plan = deck.compartments.find((entry) => entry.id === id);
  if (!plan) throw new Error(`The deck has no room '${id}'.`);
  return plan;
}

function door(id: string) {
  const plan = deck.doors.find((entry) => entry.id === id);
  if (!plan) throw new Error(`The deck has no door '${id}'.`);
  return plan;
}

/** A room of the deck at `pa` and `temperature`, filled with ship air. */
function air(id: string, pa: number, temperature: number): Air {
  return {
    moles: molesAt(pa, temperature, room(id).volume, AIR),
    temperature,
  };
}

function roomPressure(id: string, state: Air): number {
  return pressure(totalMoles(state.moles), state.temperature, room(id).volume);
}

/** The fractions of a door between two rooms of the deck, one tick. */
function fractionsOf(id: string) {
  const [a, b] = door(id).between;
  return doorFractions(door(id).area, room(a).volume, room(b).volume, dt);
}

describe('the door fractions', () => {
  it.each([
    ['bridge-habitat', 0.188064, 0.125376, 0.062688],
    ['habitat-reactor-bay', 0.170971, 0.068388, 0.102583],
    ['habitat-airlock', 0.203297, 0.018482, 0.184815],
  ])('gives %s f %s, fromA %s and fromB %s a tick', (id, f, fromA, fromB) => {
    const fractions = fractionsOf(id);
    expect(fractions.fromA + fractions.fromB).toBeCloseTo(f, 6);
    expect(fractions.fromA).toBeCloseTo(fromA, 6);
    expect(fractions.fromB).toBeCloseTo(fromB, 6);
  });

  it('shrinks the molar-density gap by 1 − f in one step', () => {
    const { fromA, fromB } = fractionsOf('bridge-habitat');
    const f = fromA + fromB;
    const [va, vb] = [room('bridge').volume, room('habitat').volume];
    const a = air('bridge', 100_000, 293);
    const b = air('habitat', 50_000, 293);
    const next = exchange(
      a,
      b,
      room('bridge').structureHeatCapacity,
      room('habitat').structureHeatCapacity,
      fromA,
      fromB,
    );
    const gap = (x: Air, y: Air) =>
      totalMoles(x.moles) / va - totalMoles(y.moles) / vb;
    const expected = (1 - f) * gap(a, b);
    expect(Math.abs(gap(next.a, next.b) - expected) / expected).toBeLessThan(
      1e-12,
    );
  });

  it('evens out a bridge at 100 kPa and a habitat at 50 kPa in 48 ticks', () => {
    const { fromA, fromB } = fractionsOf('bridge-habitat');
    const [sa, sb] = [
      room('bridge').structureHeatCapacity,
      room('habitat').structureHeatCapacity,
    ];
    let a = air('bridge', 100_000, 293);
    let b = air('habitat', 50_000, 293);
    const moles = GASES.map((gas) => a.moles[gas] + b.moles[gas]);
    const energy = (x: Air, y: Air) =>
      heatCapacity(x, sa) * x.temperature + heatCapacity(y, sb) * y.temperature;
    const before = energy(a, b);
    for (let tick = 0; tick < 48; tick += 1) {
      const next = exchange(a, b, sa, sb, fromA, fromB);
      a = next.a;
      b = next.b;
    }
    GASES.forEach((gas, i) => {
      const after = a.moles[gas] + b.moles[gas];
      expect(Math.abs(after - moles[i]) / moles[i]).toBeLessThan(1e-9);
    });
    expect(Math.abs(energy(a, b) - before) / before).toBeLessThan(1e-12);
    const [pa, pb] = [roomPressure('bridge', a), roomPressure('habitat', b)];
    expect(Math.abs(pa - pb) / pb).toBeLessThan(0.01);
    expect(pa).toBeCloseTo(66_668.18, 1);
    expect(pb).toBeCloseTo(66_665.91, 1);
  });
});

describe('the pressures across a door', () => {
  const initial = {
    bridge: air('bridge', 101_300, 293),
    habitat: air('habitat', 101_300, 293),
    'reactor-bay': air('reactor-bay', 101_300, 293),
    airlock: air('airlock', 101_300, 293),
  };

  it('reads space as 0 Pa and gives the outer door 101,300 Pa on the initial air', () => {
    const [airlock, space] = doorPressures(
      initial,
      deck.compartments,
      door('airlock-outer'),
    );
    expect(space).toBe(0);
    expect(airlock).toBeCloseTo(101_300, 6);
  });

  it('reads both rooms of an inner door in the order the door lists them', () => {
    const low = { ...initial, airlock: air('airlock', 30_000, 293) };
    const [habitat, airlock] = doorPressures(
      low,
      deck.compartments,
      door('habitat-airlock'),
    );
    expect(habitat).toBeCloseTo(101_300, 6);
    expect(airlock).toBeCloseTo(30_000, 6);
  });

  it('holds the interlock limit at 5 kPa', () => {
    expect(PRESSURE_INTERLOCK).toEqual({ limit: 5_000 });
  });
});
