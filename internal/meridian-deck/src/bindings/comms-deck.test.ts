import { afterEach, describe, expect, it } from 'vitest';

import { CommsDeckBinding } from './comms-deck.js';
import {
  TestShip,
  fixturesOfHullSections,
  idsOf,
  readingEvent,
  withRecords,
} from './test-support.js';

const ships: TestShip[] = [];
async function ship() {
  const made = await TestShip.start();
  ships.push(made);
  return made;
}
afterEach(async () => {
  for (const made of ships.splice(0)) await made.dispose();
});

const binding = new CommsDeckBinding();

describe('CommsDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('turns the relay equipment on while the array has power', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    expect(patch?.frames).toEqual({
      'comms-relay.equipment-rack': 'on',
      'comms-relay.console': 'on',
    });
  });

  it('turns it off when the array reports no power', async () => {
    const reading = (await ship()).powerUp();
    const dark = withRecords(reading, {
      comms: { ...reading.comms, status: 'no power' },
    });
    expect(
      Object.values(binding.patchOf(readingEvent(dark))?.frames ?? {}),
    ).toEqual(['off', 'off']);
  });

  it('names only fixtures of the comms hull section', async () => {
    const ids = idsOf(binding.patchOf(readingEvent((await ship()).powerUp())));
    expect(fixturesOfHullSections(['comms'])).toEqual(
      expect.arrayContaining(ids.frames),
    );
    expect([ids.rooms, ids.doors, ids.conduits, ids.alarms]).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it('reads its readouts from the frame', async () => {
    const reading = (await ship()).powerUp();
    const value = (name: string) =>
      binding.readouts.find((readout) => readout.name === name)?.read(reading);
    expect(value('array-status')).toBe('standby');
    expect(value('hail-queued')).toBe(false);
    expect(value('last-hail')).toBeNull();
    expect(value('array-power')).toBe(0);
  });
});
