import { describe, expect, it } from 'vitest';

import type { WeaponsRecord, WeaponsSetpoints } from './contracts';
import {
  hitChance,
  RAILGUN,
  railgunDemand,
  stepWeapons,
} from './weapons-model';

const dt = 0.5;
const power = RAILGUN.power;

const empty: WeaponsRecord = Object.freeze({
  status: 'idle',
  charge: 0,
  shots: 0,
  hits: 0,
  lastShot: null,
});
const unarmed: WeaponsSetpoints = Object.freeze({ armed: false, range: null });
const armed: WeaponsSetpoints = Object.freeze({ armed: true, range: null });
const aimed = (range: number): WeaponsSetpoints =>
  Object.freeze({ armed: true, range });
const holding = (charge: number): WeaponsRecord =>
  Object.freeze({ ...empty, status: 'charging', charge });
const full = Object.freeze({ ...holding(RAILGUN.capacity), status: 'charged' });

/** One railgun step at `tick` with `allocated` W from the router. */
function step(
  weapons: WeaponsRecord,
  setpoints: WeaponsSetpoints,
  allocated: number,
  {
    tick = 1,
    shed = false,
    draw = () => 0.5,
  }: { tick?: number; shed?: boolean; draw?: () => number } = {},
) {
  return stepWeapons(
    weapons,
    setpoints,
    { tick, dt, allocated, shed, draw },
    RAILGUN,
  );
}

/** The records of `ticks` armed steps from empty, each served the load it asks. */
function charge(ticks: number): WeaponsRecord[] {
  const records: WeaponsRecord[] = [];
  let weapons = empty;
  for (let tick = 1; tick <= ticks; tick++) {
    const allocated = railgunDemand(weapons, armed, RAILGUN, dt);
    weapons = step(weapons, armed, allocated, { tick }).weapons;
    records.push(weapons);
  }
  return records;
}

describe('stepWeapons', () => {
  it('charges 150,000,000 J a tick to 400,000,000 J and holds it', () => {
    const records = charge(4);
    expect(records.map(({ charge }) => charge)).toEqual([
      150_000_000, 300_000_000, 400_000_000, 400_000_000,
    ]);
    expect(records[3]).toBe(records[2]);
  });

  it('returns the objects it got when unarmed', () => {
    const next = step(empty, unarmed, 0);
    expect(next.weapons).toBe(empty);
    expect(next.setpoints).toBe(unarmed);
    expect(next.pulse).toBe(0);
  });

  it('reads charging with an allocation, held when shed and charged at full', () => {
    expect(step(empty, armed, power).weapons).toEqual({
      ...empty,
      status: 'charging',
      charge: 150_000_000,
    });
    expect(
      step(holding(150_000_000), armed, 0, { shed: true }).weapons,
    ).toEqual({ ...empty, status: 'held', charge: 150_000_000 });
    expect(step(holding(300_000_000), armed, 200_000_000).weapons).toEqual({
      ...empty,
      status: 'charged',
      charge: 400_000_000,
    });
    expect(step(holding(300_000_000), armed, power).weapons.charge).toBe(
      400_000_000,
    );
  });

  it('holds a shot at 150,000,000 J and fires it at 300,000,000 J', () => {
    const first = step(empty, aimed(10_000), power, { tick: 31 });
    expect(first.weapons.charge).toBe(150_000_000);
    expect(first.weapons.shots).toBe(0);
    expect(first.setpoints.range).toBe(10_000);
    expect(first.pulse).toBe(0);
    const second = step(first.weapons, first.setpoints, power, { tick: 32 });
    expect(second.weapons.charge).toBe(0);
    expect(second.weapons.shots).toBe(1);
    expect(second.weapons.status).toBe('charging');
  });

  it('leaves 100,000,000 J after a shot from a full bank', () => {
    const next = step(full, aimed(50_000), 0, { tick: 41 });
    expect(next.weapons.charge).toBe(100_000_000);
    expect(next.weapons.status).toBe('charging');
  });

  it('hits on a draw of 0 and misses on a draw of 0.99', () => {
    expect(
      step(full, aimed(10_000), 0, { draw: () => 0 }).weapons.lastShot?.hit,
    ).toBe(true);
    expect(
      step(full, aimed(10_000), 0, { draw: () => 0.99 }).weapons.lastShot?.hit,
    ).toBe(false);
    const edge = hitChance(10_000, RAILGUN);
    expect(
      step(full, aimed(10_000), 0, { draw: () => edge }).weapons.lastShot?.hit,
    ).toBe(false);
  });

  it('writes lastShot, shots, hits, range null and a pulse of 75,000,000 J', () => {
    const next = step(full, aimed(10_000), 0, { tick: 32, draw: () => 0 });
    expect(next.weapons).toEqual({
      status: 'charging',
      charge: 100_000_000,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });
    expect(next.setpoints).toEqual({ armed: true, range: null });
    expect(next.pulse).toBe(75_000_000);
    const refilled = { ...next.weapons, charge: 300_000_000 };
    const miss = step(refilled, aimed(50_000), 0, {
      tick: 33,
      draw: () => 0.99,
    });
    expect(miss.weapons.shots).toBe(2);
    expect(miss.weapons.hits).toBe(1);
    expect(miss.weapons.lastShot).toEqual({
      tick: 33,
      range: 50_000,
      hit: false,
    });
  });

  it('draws on a shot tick alone', () => {
    let draws = 0;
    const draw = () => {
      draws += 1;
      return 0.5;
    };
    const first = step(empty, aimed(10_000), power, { draw });
    expect(draws).toBe(0);
    const second = step(first.weapons, first.setpoints, power, { draw });
    expect(draws).toBe(1);
    step(second.weapons, second.setpoints, power, { draw });
    step(empty, unarmed, 0, { draw });
    expect(draws).toBe(1);
  });

  it('freezes every record a step builds', () => {
    const charged = step(empty, armed, power);
    const shot = step(full, aimed(10_000), 0);
    for (const value of [
      charged.weapons,
      shot.weapons,
      shot.weapons.lastShot,
      shot.setpoints,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});

describe('railgunDemand', () => {
  it('tapers the third charging tick to 200,000,000 W', () => {
    const asks = [empty, ...charge(2)].map((weapons) =>
      railgunDemand(weapons, armed, RAILGUN, dt),
    );
    expect(asks).toEqual([300_000_000, 300_000_000, 200_000_000]);
  });

  it('asks 100,000,000 W at dt 1 from 300,000,000 J and 200,000,000 W at dt 2 from empty', () => {
    expect(railgunDemand(holding(300_000_000), armed, RAILGUN, 1)).toBe(
      100_000_000,
    );
    expect(railgunDemand(empty, armed, RAILGUN, 2)).toBe(200_000_000);
  });

  it('asks 0 W unarmed or full', () => {
    expect(railgunDemand(empty, unarmed, RAILGUN, dt)).toBe(0);
    expect(railgunDemand(full, armed, RAILGUN, dt)).toBe(0);
    expect(railgunDemand(full, aimed(10_000), RAILGUN, dt)).toBe(0);
  });
});

describe('hitChance', () => {
  it('gives hitChance 0.8 at 0 m and 0.8 over e at 50,000 m', () => {
    expect(hitChance(0, RAILGUN)).toBe(0.8);
    expect(Math.abs(hitChance(50_000, RAILGUN) - 0.8 / Math.E)).toBeLessThan(
      1e-15,
    );
  });
});
