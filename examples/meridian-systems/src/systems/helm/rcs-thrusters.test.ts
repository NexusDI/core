import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';
import { shipState } from '../../../test/ship-state';

import { RCS_THRUSTERS } from './helm-model';
import { RcsThrusters } from './rcs-thrusters';

describe('RcsThrusters', () => {
  it('reads the thruster rating', () => {
    const thrusters = new RcsThrusters(shipState(deck satisfies DeckPlan));
    expect(thrusters.rating).toBe(RCS_THRUSTERS);
  });

  it('queues the heading wrapped to (−π, π] for the next tick', () => {
    const state = shipState(deck satisfies DeckPlan);
    expect(new RcsThrusters(state).steer(4)).toEqual({ tick: 1 });
    const ship = state.applyQueued(1);
    expect(ship.setpoints.helm).toEqual({ heading: 4 - 2 * Math.PI });
    expect(state.log()).toEqual([
      { tick: 1, change: { helm: { heading: 4 - 2 * Math.PI } } },
    ]);
  });

  it.each([NaN, Infinity])('refuses to steer a heading of %o', (heading) => {
    const state = shipState(deck satisfies DeckPlan);
    expect(() => new RcsThrusters(state).steer(heading)).toThrow(
      new RangeError(
        `steer() takes a finite heading in rad, and got ${heading}.`,
      ),
    );
    expect(state.log()).toEqual([]);
  });
});
