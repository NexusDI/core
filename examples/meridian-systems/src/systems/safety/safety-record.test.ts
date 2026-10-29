import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { DOOR_IDS, type DeckPlan } from '../../simulation/contracts';

import { safetyRecord } from './safety-record';

const plan = deck satisfies DeckPlan;

describe('safetyRecord', () => {
  it('starts with every door shut, no flood, no drill, no fire and no alarm', () => {
    const record = safetyRecord(plan);
    expect(record).toStrictEqual({
      records: {
        safety: {
          fires: { bridge: 0, habitat: 0, 'reactor-bay': 0, airlock: 0 },
          flooded: { bridge: 0, habitat: 0, 'reactor-bay': 0 },
          alarms: [],
        },
      },
      setpoints: {
        safety: {
          doors: {
            'bridge-habitat': false,
            'habitat-reactor-bay': false,
            'habitat-airlock': false,
            'airlock-outer': false,
          },
          floods: { bridge: false, habitat: false, 'reactor-bay': false },
          drills: { bridge: false, habitat: false, 'reactor-bay': false },
        },
      },
    });
    expect(Object.keys(record.setpoints.safety.doors)).toEqual([...DOOR_IDS]);
  });
});
