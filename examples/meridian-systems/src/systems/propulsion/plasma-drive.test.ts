import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { PLASMA_DRIVE } from '../../physics/motion';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import { PlasmaDrive } from './plasma-drive';

describe('PlasmaDrive', () => {
  it('reads the plasma drive rating', () => {
    const drive = new PlasmaDrive(new ShipStateStore(deck satisfies DeckPlan));
    expect(drive.rating).toBe(PLASMA_DRIVE);
  });

  it('queues the throttle for the next tick', () => {
    const state = new ShipStateStore(deck satisfies DeckPlan);
    expect(new PlasmaDrive(state).throttle(1)).toEqual({ tick: 1 });
    const ship = state.applyQueued(1);
    expect(ship.setpoints.drive).toEqual({ throttle: 1 });
    expect(state.log()).toEqual([
      { tick: 1, change: { drive: { throttle: 1 } } },
    ]);
  });
});
