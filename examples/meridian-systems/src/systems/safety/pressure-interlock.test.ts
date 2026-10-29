import type { CallContext } from '@nexusdi/interceptors';
import { describe, expect, it, vi } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { InterlockError } from '../../errors';
import { AIR, molesAt } from '../../physics/gas';
import type { CompartmentId, DeckPlan } from '../../simulation/contracts';
import { shipState } from '../../../test/ship-state';

import { PressureInterlock } from './pressure-interlock';

const plan = deck satisfies DeckPlan;

/** An interlock over the deck's ship with the airlock at `pa` Pa. */
function build(pa = 101_300) {
  const state = shipState(plan);
  const ship = state.snapshot();
  const room = plan.compartments.find((entry) => entry.id === 'airlock');
  if (!room) throw new Error('the deck has no airlock');
  const airlock = {
    moles: molesAt(pa, 293, room.volume, AIR),
    temperature: 293,
  };
  state.commit({
    ...ship,
    compartments: { ...ship.compartments, airlock },
  });
  return new PressureInterlock(state, plan);
}

/** The call of `open(door)` on the blast-door panel. */
function call(door: unknown, method = 'open'): CallContext {
  return {
    instance: {},
    provider: {} as CallContext['provider'],
    method,
    args: [door],
    async: false,
    scope: null,
  };
}

/** What `intercept` threw. */
function refusal(interlock: PressureInterlock, door: string): unknown {
  try {
    interlock.intercept(call(door), () => ({ tick: 1 }));
  } catch (error) {
    return error;
  }
  throw new Error('intercept() let the door open');
}

describe('PressureInterlock', () => {
  it('hands a door the deck lacks to the panel', () => {
    const next = vi.fn(() => ({ tick: 1 }));
    expect(build().intercept(call('galley-hatch'), next)).toEqual({ tick: 1 });
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    ['equal sides', 101_300],
    ['5,000 Pa across', 96_300],
    ['5,000.4 Pa across, which rounds to 5,000', 96_299.6],
  ])('opens a door with %s', (_name, pa) => {
    const next = vi.fn(() => ({ tick: 1 }));
    expect(build(pa).intercept(call('habitat-airlock'), next)).toEqual({
      tick: 1,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('refuses a door with 5,001 Pa across and runs no panel', () => {
    const next = vi.fn();
    const interlock = build(96_299);
    expect(() => interlock.intercept(call('habitat-airlock'), next)).toThrow(
      InterlockError,
    );
    expect(next).not.toHaveBeenCalled();
    expect(refusal(interlock, 'habitat-airlock')).toMatchObject({
      code: 'MERIDIAN_INTERLOCK',
      door: 'habitat-airlock',
      difference: 5_001,
      limit: 5_000,
    });
  });

  it('reads space as 0 Pa', () => {
    const next = vi.fn(() => ({ tick: 1 }));
    expect(build(4_000).intercept(call('airlock-outer'), next)).toEqual({
      tick: 1,
    });
    expect(refusal(build(), 'airlock-outer')).toMatchObject({
      door: 'airlock-outer',
      difference: 101_300,
    });
  });

  it('reads the committed snapshot on each call', () => {
    const state = shipState(plan);
    const interlock = new PressureInterlock(state, plan);
    const ship = state.snapshot();
    const habitat = ship.compartments.habitat;
    expect(() =>
      interlock.intercept(call('bridge-habitat'), () => undefined),
    ).not.toThrow();
    state.commit({
      ...ship,
      compartments: {
        ...ship.compartments,
        ['habitat' satisfies CompartmentId]: {
          ...habitat,
          temperature: habitat.temperature * 0.9,
        },
      },
    });
    expect(refusal(interlock, 'bridge-habitat')).toBeInstanceOf(InterlockError);
  });
});
