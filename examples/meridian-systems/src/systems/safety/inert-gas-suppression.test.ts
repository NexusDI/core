import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { BadCommandError } from '../../errors';
import type { DeckPlan } from '../../simulation/contracts';
import { shipState } from '../../../test/ship-state';

import { SAFETY_ACTIONS } from './contracts';
import { InertGasSuppression } from './inert-gas-suppression';

function build() {
  const state = shipState(deck satisfies DeckPlan);
  return { state, suppression: new InertGasSuppression(state) };
}

describe('InertGasSuppression', () => {
  it('queues a flood of a charged room for the next tick', () => {
    const { state, suppression } = build();
    expect(suppression.flood('habitat')).toEqual({ tick: 1 });
    const { floods } = state.applyQueued(1).setpoints.safety;
    expect(
      Object.entries(floods)
        .filter(([, on]) => on)
        .map(([id]) => id),
    ).toEqual(['habitat']);
    expect(Object.keys(floods)).toHaveLength(11);
  });

  it('queues a drill of a charged room for the next tick', () => {
    const { state, suppression } = build();
    expect(suppression.drill('reactor-bay')).toEqual({ tick: 1 });
    const { drills } = state.applyQueued(1).setpoints.safety;
    expect(
      Object.entries(drills)
        .filter(([, on]) => on)
        .map(([id]) => id),
    ).toEqual(['reactor-bay']);
    expect(Object.keys(drills)).toHaveLength(11);
  });

  it.each([
    ['flood', 'airlock'],
    ['drill', 'airlock'],
    ['flood', 'galley'],
    ['drill', 'constructor'],
  ] as const)(
    'refuses %s of %s, which has no charge',
    (action, compartment) => {
      const { state, suppression } = build();
      const call = () => suppression[action](compartment);
      expect(call).toThrow(BadCommandError);
      expect(call).toThrow(
        expect.objectContaining({
          code: 'MERIDIAN_BAD_COMMAND',
          reason: 'argument',
          system: 'safety',
          action,
          argument: 'compartment',
          expected: SAFETY_ACTIONS,
        }),
      );
      expect(state.applyQueued(1).setpoints.safety).toEqual(
        shipState(deck).snapshot().setpoints.safety,
      );
    },
  );
});
