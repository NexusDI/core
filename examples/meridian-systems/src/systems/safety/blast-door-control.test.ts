import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { BadCommandError } from '../../errors';
import type { DeckPlan } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { BlastDoorControl } from './blast-door-control';
import { SAFETY_ACTIONS } from './contracts';

function build() {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  return { state, doors: new BlastDoorControl(state) };
}

describe('BlastDoorControl', () => {
  it('queues a door open for the next tick and leaves the others shut', () => {
    const { state, doors } = build();
    expect(doors.open('habitat-airlock')).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.safety.doors).toEqual({
      'bridge-habitat': false,
      'habitat-reactor-bay': false,
      'habitat-airlock': true,
      'airlock-outer': false,
    });
  });

  it('queues an open door shut', () => {
    const { state, doors } = build();
    doors.open('bridge-habitat');
    expect(state.applyQueued(1).setpoints.safety.doors['bridge-habitat']).toBe(
      true,
    );
    doors.close('bridge-habitat');
    expect(state.applyQueued(1).setpoints.safety.doors['bridge-habitat']).toBe(
      false,
    );
  });

  it('queues a close of a shut door, which changes nothing', () => {
    const { state, doors } = build();
    const before = state.snapshot().setpoints.safety.doors;
    expect(doors.close('airlock-outer')).toEqual({ tick: 1 });
    expect(state.applyQueued(1).setpoints.safety.doors).toEqual(before);
  });

  it.each([
    ['open', 'galley-hatch'],
    ['close', 'galley-hatch'],
    ['open', 'constructor'],
    ['close', 'toString'],
  ] as const)('refuses %s of the unknown door %s', (action, door) => {
    const { state, doors } = build();
    const call = () => doors[action](door);
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
  });
});
