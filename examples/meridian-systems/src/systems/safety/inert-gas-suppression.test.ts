import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { BadCommandError } from '../../errors';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { SAFETY_ACTIONS } from './contracts';
import { InertGasSuppression } from './inert-gas-suppression';

function build() {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  return { state, suppression: new InertGasSuppression(state) };
}

describe('InertGasSuppression', () => {
  it('queues a flood of a charged room for the next tick', () => {
    const { state, suppression } = build();
    expect(suppression.flood('habitat')).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.safety.floods).toEqual({
      bridge: false,
      habitat: true,
      'reactor-bay': false,
    });
  });

  it('queues a drill of a charged room for the next tick', () => {
    const { state, suppression } = build();
    expect(suppression.drill('reactor-bay')).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.safety.drills).toEqual({
      bridge: false,
      habitat: false,
      'reactor-bay': true,
    });
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
          expected: SAFETY_ACTIONS,
        }),
      );
      expect(state.applyQueued(1).setpoints.safety).toEqual(
        new ShipStateStore(deck).snapshot().setpoints.safety,
      );
    },
  );
});
