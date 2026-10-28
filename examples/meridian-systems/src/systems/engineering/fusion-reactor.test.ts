import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { FUSION_REACTOR } from '../../physics/thermal';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import { FusionReactor } from './fusion-reactor';

/** A store whose snapshot runs the reactor at `level` on tick 40. */
function running(level: number): ShipStateStore {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const ship = state.snapshot();
  state.commit({
    ...ship,
    tick: 40,
    time: 20,
    reactor: {
      level,
      thermal: level * 3.63e9,
      electric: (level * 3.63e9) / 3,
      tripped: false,
    },
    setpoints: { ...ship.setpoints, reactor: { throttle: 1 } },
  });
  return state;
}

describe('FusionReactor', () => {
  it('reads its electric output in GW', () => {
    expect(new FusionReactor(running(1)).output).toBeCloseTo(1.21, 12);
  });

  it('carries the reactor rating', () => {
    expect(new FusionReactor(running(0)).rating).toBe(FUSION_REACTOR);
  });

  it('queues the throttle for the next tick', () => {
    const state = running(0.4);
    expect(new FusionReactor(state).throttle(0.5)).toEqual({ tick: 41 });
    expect(state.applyQueued(41).setpoints.reactor).toEqual({ throttle: 0.5 });
  });

  it('scrams on dispose: level, output and throttle drop to 0 at the same tick', () => {
    const state = running(0.4);
    new FusionReactor(state)[Symbol.dispose]();
    const ship = state.snapshot();
    expect(ship.tick).toBe(40);
    expect(ship.time).toBe(20);
    expect(ship.reactor).toEqual({
      level: 0,
      thermal: 0,
      electric: 0,
      tripped: false,
    });
    expect(ship.setpoints.reactor).toEqual({ throttle: 0 });
    expect(ship.setpoints.shields).toEqual({ raised: false });
  });
});
