import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { PowerBudgetError } from '../../errors';
import type { DeckPlan } from '../../simulation/contracts';
import type { IPowerRouter, PowerLoad } from '../engineering/contracts';
import { shipState } from '../../../test/ship-state';

import { RailgunMount } from './railgun-mount';
import { RAILGUN } from './weapons-model';

/** A mount at `dt` over a fake router that records each divert and refuses when told. */
function build({ dt = 0.5, refuse = false } = {}) {
  const state = shipState(deck satisfies DeckPlan);
  const diverted: PowerLoad[] = [];
  const router: IPowerRouter = {
    loads: () => [],
    register: () => () => {},
    divert(load) {
      diverted.push(load);
      if (refuse) {
        throw new PowerBudgetError({
          consumer: load.id,
          demand: load.demand,
          available: 0,
        });
      }
    },
  };
  const mount = new RailgunMount(state, { dt }, router);
  return { state, diverted, mount };
}

describe('RailgunMount', () => {
  it('reads the railgun rating', () => {
    expect(build().mount.rating).toBe(RAILGUN);
  });

  it('diverts 300,000,000 W on an unarmed fire and queues the armed setpoints with the range', () => {
    const { state, diverted, mount } = build();
    expect(mount.fire(10_000)).toEqual({ tick: 1 });
    expect(diverted).toEqual([
      { id: 'railgun', priority: 6, demand: 300e6, heatShare: 0 },
    ]);
    state.applyQueued(1);
    expect(state.log()).toEqual([
      { tick: 1, change: { weapons: { armed: true, range: 10_000 } } },
    ]);
  });

  it('diverts 200,000,000 W on an unarmed fire at dt 2', () => {
    const { diverted, mount } = build({ dt: 2 });
    mount.fire(10_000);
    expect(diverted.map(({ demand }) => demand)).toEqual([200_000_000]);
  });

  it('queues nothing when the router refuses the load', () => {
    const { state, mount } = build({ refuse: true });
    expect(() => mount.fire(10_000)).toThrow(PowerBudgetError);
    expect(state.applyQueued(1)).toBe(state.snapshot());
    expect(state.log()).toEqual([]);
  });

  it('asks no divert on an armed mount and queues the range alone', () => {
    const { state, diverted, mount } = build();
    mount.fire(10_000);
    state.commit({ ...state.applyQueued(1), tick: 1 });
    expect(mount.fire(50_000)).toEqual({ tick: 2 });
    expect(diverted).toHaveLength(1);
    state.applyQueued(2);
    expect(state.log()).toEqual([
      { tick: 1, change: { weapons: { armed: true, range: 10_000 } } },
      { tick: 2, change: { weapons: { range: 50_000 } } },
    ]);
  });

  it.each([-1, 100_001, NaN, Infinity])(
    'throws RangeError for a range of %o and queues nothing',
    (range) => {
      const { state, diverted, mount } = build();
      expect(() => mount.fire(range)).toThrow(RangeError);
      expect(diverted).toEqual([]);
      state.applyQueued(1);
      expect(state.log()).toEqual([]);
    },
  );

  it.each([0, 100_000])('fires at the end of the range, %o m', (range) => {
    const { state, mount } = build();
    mount.fire(range);
    state.applyQueued(1);
    expect(state.log()).toEqual([
      { tick: 1, change: { weapons: { armed: true, range } } },
    ]);
  });
});
