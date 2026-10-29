import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';
import { shipState } from '../../../test/ship-state';

import type { IShieldGrid, PowerLoad } from './contracts';
import { ShieldPower } from './engineering-power';

const start = shipState(deck satisfies DeckPlan).snapshot();

/** A grid that draws `load` and queues nothing. */
function grid(load: PowerLoad): IShieldGrid {
  return {
    draw: () => load,
    raise: () => ({ tick: 1 }),
    lower: () => ({ tick: 1 }),
  };
}

describe('ShieldPower', () => {
  it('draws the load of the grid on the ship it reads', () => {
    const load = { id: 'shields', priority: 2, demand: 200e6, heatShare: 0.25 };
    const seen: unknown[] = [];
    const power = new ShieldPower({
      ...grid(load),
      draw(ship) {
        seen.push(ship);
        return load;
      },
    });
    expect(power.draw(start)).toBe(load);
    expect(seen).toEqual([start]);
  });
});
