import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { PowerBudgetError } from '../../errors';
import type { PowerLoad } from '../../physics/power';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { IPowerRouter } from './contracts';
import { DeflectorGrid } from './deflector-grid';

function build(refuse = false) {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const diverted: PowerLoad[] = [];
  const router: IPowerRouter = {
    loads: () => [],
    attach: () => () => {},
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
  return { state, diverted, grid: new DeflectorGrid(state, router) };
}

describe('DeflectorGrid', () => {
  it('draws nothing while its setpoint is lowered', () => {
    const { state, grid } = build();
    expect(grid.draw(state.snapshot())).toEqual({
      id: 'shields',
      priority: 2,
      demand: 0,
      heatShare: 0.25,
    });
  });

  it('draws 200 MW while its setpoint is raised', () => {
    const { state, grid } = build();
    const ship = state.snapshot();
    expect(
      grid.draw({
        ...ship,
        setpoints: { ...ship.setpoints, shields: { raised: true } },
      }),
    ).toEqual({ id: 'shields', priority: 2, demand: 200e6, heatShare: 0.25 });
  });

  it('diverts the raised load, then queues the raised setpoint', () => {
    const { state, diverted, grid } = build();
    expect(grid.raise()).toEqual({ tick: 1 });
    expect(diverted).toEqual([
      { id: 'shields', priority: 2, demand: 200e6, heatShare: 0.25 },
    ]);
    expect(state.applyQueued(1).setpoints.shields).toEqual({ raised: true });
  });

  it('queues nothing when the router refuses the raised load', () => {
    const { state, grid } = build(true);
    expect(() => grid.raise()).toThrow(PowerBudgetError);
    state.applyQueued(1);
    expect(state.log()).toEqual([]);
  });

  it('queues the lowered setpoint', () => {
    const { state, diverted, grid } = build();
    expect(grid.lower()).toEqual({ tick: 1 });
    expect(diverted).toEqual([]);
    expect(state.log()).toEqual([]);
    state.applyQueued(1);
    expect(state.log()).toEqual([
      { tick: 1, change: { shields: { raised: false } } },
    ]);
  });
});
