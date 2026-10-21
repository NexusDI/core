import { describe, expect, it } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import { AIR, molesAt } from '../physics/gas';
import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type DeckPlan,
} from './contracts';
import { ShipStateStore } from './ship-state-store';

const plan = deck satisfies DeckPlan;

describe('ShipStateStore', () => {
  it('starts at tick 0 and time 0', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.tick).toBe(0);
    expect(ship.time).toBe(0);
  });

  it('holds one record per compartment id, in the order of the list', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(Object.keys(ship.compartments)).toEqual([...COMPARTMENT_IDS]);
  });

  it('fills every compartment with the deck initial air at 293 K', () => {
    const ship = new ShipStateStore(plan).snapshot();
    for (const room of plan.compartments) {
      expect(ship.compartments[room.id as CompartmentId]).toEqual({
        moles: molesAt(101_300, 293, room.volume, AIR),
        temperature: 293,
      });
    }
  });

  it('freezes the snapshot and its records', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(Object.isFrozen(ship)).toBe(true);
    expect(Object.isFrozen(ship.compartments)).toBe(true);
    for (const id of COMPARTMENT_IDS) {
      expect(Object.isFrozen(ship.compartments[id])).toBe(true);
      expect(Object.isFrozen(ship.compartments[id].moles)).toBe(true);
    }
  });

  it('replaces the snapshot on commit', () => {
    const store = new ShipStateStore(plan);
    const next = { ...store.snapshot(), tick: 1, time: 0.5 };
    store.commit(next);
    expect(store.snapshot()).toBe(next);
  });

  it('refuses a deck plan that leaves out a compartment', () => {
    const partial: DeckPlan = {
      ...plan,
      compartments: plan.compartments.filter((room) => room.id !== 'airlock'),
    };
    expect(() => new ShipStateStore(partial)).toThrow(/'airlock'/);
  });

  it('refuses a deck plan that names an unknown compartment', () => {
    const extra: DeckPlan = {
      ...plan,
      compartments: [
        ...plan.compartments,
        { ...plan.compartments[0], id: 'galley' },
      ],
    };
    expect(() => new ShipStateStore(extra)).toThrow(/'galley'/);
  });
});
