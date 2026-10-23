import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { RCS_THRUSTERS } from '../../physics/motion';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { RcsThrusters } from './rcs-thrusters';

describe('RcsThrusters', () => {
  it('reads the thruster rating', () => {
    const thrusters = new RcsThrusters(
      new ShipStateStore(deck satisfies DeckPlan),
    );
    expect(thrusters.rating).toBe(RCS_THRUSTERS);
  });

  it('queues the heading wrapped to (−π, π] for the next tick', () => {
    const state = new ShipStateStore(deck satisfies DeckPlan);
    expect(new RcsThrusters(state).steer(4)).toEqual({ tick: 1 });
    const ship = state.applyQueued(1);
    expect(ship.setpoints.helm).toEqual({ heading: 4 - 2 * Math.PI });
    expect(state.log()).toEqual([
      { tick: 1, change: { helm: { heading: 4 - 2 * Math.PI } } },
    ]);
  });
});
