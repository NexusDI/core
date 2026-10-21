import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { PowerBudgetError } from '../../errors';
import type { PowerLoad } from '../../physics/power';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { IShieldGrid } from './contracts';
import { PlasmaRouter } from './plasma-router';

const RAISED: PowerLoad = {
  id: 'shields',
  priority: 2,
  demand: 200e6,
  heatShare: 0.25,
};

/** A store whose reactor gives `electric` W, and a grid that draws `draw`. */
function build(electric: number, draw: PowerLoad = { ...RAISED, demand: 0 }) {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const ship = state.snapshot();
  state.commit({ ...ship, reactor: { ...ship.reactor, electric } });
  const seen: ShipSnapshot[] = [];
  let calls = 0;
  const grid: IShieldGrid = {
    draw(at) {
      seen.push(at);
      return draw;
    },
    raise: () => ({ tick: 1 }),
    lower: () => ({ tick: 1 }),
  };
  const router = new PlasmaRouter(state, () => {
    calls += 1;
    return grid;
  });
  return { state, router, seen, calls: () => calls };
}

/** What `router.divert(load)` threw. */
function refusal(router: PlasmaRouter, load: PowerLoad): unknown {
  try {
    router.divert(load);
  } catch (error) {
    return error;
  }
  throw new Error('divert() accepted the load');
}

describe('PlasmaRouter', () => {
  it('reads the shield grid only when it lists the loads', () => {
    const { state, router, seen, calls } = build(0);
    expect(calls()).toBe(0);
    const ship = state.snapshot();
    expect(router.loads(ship)).toEqual([{ ...RAISED, demand: 0 }]);
    expect(calls()).toBe(1);
    expect(seen).toEqual([ship]);
  });

  it('refuses 200 MW of shields at 193.6 MW', () => {
    const { router } = build(193.6e6);
    const error = refusal(router, RAISED);
    expect(error).toBeInstanceOf(PowerBudgetError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_POWER_BUDGET',
      consumer: 'shields',
      demand: 200e6,
      available: 193.6e6,
    });
  });

  it('fits 200 MW of shields at 205.7 MW', () => {
    expect(() => build(205.7e6).router.divert(RAISED)).not.toThrow();
  });

  it('counts the loads served first against a new load', () => {
    const { router } = build(300e6, RAISED);
    const drive: PowerLoad = {
      id: 'drive',
      priority: 3,
      demand: 150e6,
      heatShare: 0,
    };
    expect(refusal(router, drive)).toMatchObject({
      consumer: 'drive',
      demand: 150e6,
      available: 100e6,
    });
  });

  it('counts a load of the same priority served first by id against a new load', () => {
    const { router } = build(250e6, RAISED);
    const zeta: PowerLoad = {
      id: 'zeta',
      priority: 2,
      demand: 100e6,
      heatShare: 0,
    };
    expect(refusal(router, zeta)).toMatchObject({
      consumer: 'zeta',
      demand: 100e6,
      available: 50e6,
    });
  });

  it('swaps a load in by id, so the current draw of the grid does not count twice', () => {
    expect(() => build(250e6, RAISED).router.divert(RAISED)).not.toThrow();
  });
});
