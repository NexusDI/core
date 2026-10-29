import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import {
  COMPARTMENT_IDS,
  type DeckPlan,
  DOOR_IDS,
} from '../../simulation/contracts';

import { safetyRecord } from './safety-record';

const plan = deck satisfies DeckPlan;

/** The eleven rooms with a flood charge: every room but the airlock and the two bays. */
const CHARGED = [
  'bridge',
  'habitat',
  'reactor-bay',
  'chart-room',
  'computer-core',
  'quarters',
  'comms-relay',
  'capacitor-room',
  'engineering',
  'ftl-core',
  'main-drive',
];

describe('safetyRecord', () => {
  it('starts with every door shut, no flood, no drill, no fire and no alarm', () => {
    const each = <T>(ids: readonly string[], value: T) =>
      Object.fromEntries(ids.map((id) => [id, value]));
    const record = safetyRecord(plan);
    expect(record).toStrictEqual({
      records: {
        safety: {
          fires: each(COMPARTMENT_IDS, 0),
          flooded: each(CHARGED, 0),
          alarms: [],
        },
      },
      setpoints: {
        safety: {
          doors: each(DOOR_IDS, false),
          floods: each(CHARGED, false),
          drills: each(CHARGED, false),
        },
      },
    });
    expect(Object.keys(record.setpoints.safety.doors)).toEqual([...DOOR_IDS]);
  });
});
