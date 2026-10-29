import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { shipState } from '../../test/ship-state';

import type { DeckPlan, ShipSnapshot } from './contracts';
import { roundNumber, roundSnapshot } from './round-snapshot';

const ship = shipState(deck satisfies DeckPlan).snapshot();

describe('roundSnapshot', () => {
  it('rounds a fraction to four significant digits', () => {
    expect(roundNumber(101_312.874)).toBe(101_300);
    expect(roundNumber(0.000_412_37)).toBe(0.000_412_4);
    expect(roundNumber(-2.718_28)).toBe(-2.718);
    expect(roundNumber(293.000_000_1)).toBe(293);
  });

  it('keeps an integer exact', () => {
    expect(roundNumber(12_345)).toBe(12_345);
    expect(roundNumber(0)).toBe(0);
  });

  it('rounds every compartment value and keeps the tick exact', () => {
    const later: ShipSnapshot = { ...ship, tick: 12_345, time: 6172.5 };
    const rounded = roundSnapshot(later);
    expect(rounded.tick).toBe(12_345);
    expect(rounded.time).toBe(6173);
    const habitat = ship.compartments.habitat;
    expect(rounded.compartments.habitat.temperature).toBe(293);
    expect(rounded.compartments.habitat.moles.O2).toBe(
      Number(habitat.moles.O2.toPrecision(4)),
    );
    expect(rounded.compartments.habitat.moles.volatiles).toBe(
      Number(habitat.moles.volatiles.toPrecision(4)),
    );
  });

  it('returns plain JSON that a round trip leaves equal', () => {
    const rounded = roundSnapshot(ship);
    expect(Object.isFrozen(rounded)).toBe(false);
    expect(JSON.parse(JSON.stringify(rounded))).toStrictEqual(rounded);
    expect(Object.keys(rounded.compartments)).toEqual(
      Object.keys(ship.compartments),
    );
  });

  it('leaves the snapshot it reads unchanged', () => {
    const before = JSON.stringify(ship);
    roundSnapshot(ship);
    expect(JSON.stringify(ship)).toBe(before);
  });
});
