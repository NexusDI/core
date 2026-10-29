import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';

import { lifeSupportRecord } from './life-support-record';

const plan = deck satisfies DeckPlan;

describe('lifeSupportRecord', () => {
  it('starts life support offline with every device the deck lists at its initial setting', () => {
    expect(lifeSupportRecord(plan)).toStrictEqual({
      records: { lifeSupport: { heaters: { bridge: 0, habitat: 0 } } },
      setpoints: {
        lifeSupport: {
          online: false,
          heaters: {
            bridge: { on: true, target: 293 },
            habitat: { on: true, target: 293 },
          },
          scrubbers: { bridge: true, habitat: true },
          oxygen: { bridge: true, habitat: true },
          vents: { airlock: false },
          pumps: { airlock: 'off' },
        },
      },
    });
  });

  it('sets each heater to the deck initial temperature', () => {
    const warm = { ...plan, initial: { ...plan.initial, temperature: 296 } };
    expect(
      lifeSupportRecord(warm).setpoints.lifeSupport.heaters.bridge,
    ).toEqual({ on: true, target: 296 });
  });
});
