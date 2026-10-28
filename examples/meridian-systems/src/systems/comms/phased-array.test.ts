import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { ISubspaceLink } from './contracts';
import { PhasedArray } from './phased-array';

const link: ISubspaceLink = {
  receive: () => Promise.reject(new Error('no tick calls the link')),
};

function store() {
  return new ShipStateStore(deck satisfies DeckPlan);
}

describe('PhasedArray', () => {
  it('reads linked when the graph binds a subspace link', () => {
    expect(new PhasedArray(store(), link).linked).toBe(true);
  });

  it('reads unlinked when the graph binds none', () => {
    expect(new PhasedArray(store(), undefined).linked).toBe(false);
  });

  it('queues a hail for the next tick', () => {
    const state = store();
    expect(new PhasedArray(state, undefined).hail()).toEqual({ tick: 1 });
    const ship = state.applyQueued(1);
    expect(ship.setpoints.comms).toEqual({ hail: true });
    expect(state.log()).toEqual([
      { tick: 1, change: { comms: { hail: true } } },
    ]);
  });
});
