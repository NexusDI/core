import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { DeckPlan } from '../../simulation/contracts';

import { lifeSupportRecord } from './life-support-record';

const plan = deck satisfies DeckPlan;

/** Every room with a heater: all but the reactor bay, the airlock and the two bays. */
const HEATED = [
  'bridge',
  'habitat',
  'chart-room',
  'computer-core',
  'quarters',
  'comms-relay',
  'capacitor-room',
  'engineering',
  'ftl-core',
  'main-drive',
];

/** The three rooms where crew breathe, each with a scrubber and a generator. */
const CREWED = ['bridge', 'habitat', 'quarters'];

describe('lifeSupportRecord', () => {
  it('starts life support offline with every device the deck lists at its initial setting', () => {
    const each = <T>(ids: readonly string[], value: T) =>
      Object.fromEntries(ids.map((id) => [id, value]));
    expect(lifeSupportRecord(plan)).toStrictEqual({
      records: { lifeSupport: { heaters: each(HEATED, 0) } },
      setpoints: {
        lifeSupport: {
          online: false,
          heaters: each(HEATED, { on: true, target: 293 }),
          scrubbers: each(CREWED, true),
          oxygen: each(CREWED, true),
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
