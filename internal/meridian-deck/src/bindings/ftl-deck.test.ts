import { afterEach, describe, expect, it } from 'vitest';

import { FtlDeckBinding } from './ftl-deck.js';
import {
  TestShip,
  fixturesOfHullSections,
  idsOf,
  readingEvent,
  withRecords,
} from './test-support.js';

const ships: TestShip[] = [];
async function ship(ftl = true) {
  const made = await TestShip.start({ ftl });
  ships.push(made);
  return made;
}
afterEach(async () => {
  for (const made of ships.splice(0)) await made.dispose();
});

const binding = new FtlDeckBinding();
const RING = 'ftl-core.ring';

/** The frame with the FTL status replaced and, optionally, a fire in the FTL core. */
async function frame(status: string, fire = 0) {
  const reading = (await ship()).powerUp();
  return withRecords(reading, {
    ftl: { ...(reading.ftl as object), status } as never,
    safety: {
      ...reading.safety,
      fires: { ...reading.safety.fires, 'ftl-core': fire },
    },
  });
}

describe('FtlDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('turns the ring off while the status is offline', async () => {
    const patch = binding.patchOf(readingEvent(await frame('offline')));
    expect(patch?.frames?.[RING]).toBe('off');
    expect(patch?.fixtures).toEqual({});
  });

  it.each(['idle', 'held', 'spooling', 'charged'])(
    'turns the ring on while the status is %s',
    async (status) => {
      const patch = binding.patchOf(readingEvent(await frame(status)));
      expect(patch?.frames?.[RING]).toBe('on');
    },
  );

  it('turns the ring off on a ship that has not loaded the drive', async () => {
    const reading = (await ship(false)).powerUp();
    expect(reading.ftl).toBeUndefined();
    expect(binding.patchOf(readingEvent(reading))?.frames?.[RING]).toBe('off');
  });

  it('dims the glow to standby while the drive idles and leaves it to the frame otherwise', async () => {
    expect(
      binding.patchOf(readingEvent(await frame('idle')))?.fixtures,
    ).toEqual({ [RING]: 'standby' });
    expect(
      binding.patchOf(readingEvent(await frame('spooling')))?.fixtures,
    ).toEqual({});
  });

  it('marks the ring damaged under a fire in its room', async () => {
    const patch = binding.patchOf(readingEvent(await frame('charged', 0.4)));
    expect(patch?.frames?.[RING]).toBe('damaged');
  });

  it('names only fixtures of the FTL core hull section', async () => {
    const ids = idsOf(binding.patchOf(readingEvent(await frame('idle'))));
    expect(fixturesOfHullSections(['ftl-core'])).toEqual(
      expect.arrayContaining(ids.frames),
    );
    expect(fixturesOfHullSections(['ftl-core'])).toEqual(
      expect.arrayContaining(ids.fixtures),
    );
    expect([ids.rooms, ids.doors, ids.conduits, ids.alarms]).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it('reads its readouts from the frame, and null before the drive loads', async () => {
    const loaded = await frame('spooling');
    const value = (name: string, reading = loaded) =>
      binding.readouts.find((readout) => readout.name === name)?.read(reading);
    expect(value('ftl-status')).toBe('spooling');
    expect(value('sector')).toBe('Sol');
    expect(value('last-jump')).toBeNull();
    expect(value('spool-charge')).toBe(0);
    const bare = (await ship(false)).advance(1);
    expect(value('ftl-status', bare)).toBeNull();
    expect(value('spool-charge', bare)).toBeNull();
  });
});
