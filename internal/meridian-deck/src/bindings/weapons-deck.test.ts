import { afterEach, describe, expect, it } from 'vitest';

import { WeaponsDeckBinding } from './weapons-deck.js';
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

const binding = new WeaponsDeckBinding();

describe('WeaponsDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('turns the capacitor room machines on with the reactor and off without it', async () => {
    const running = (await ship()).powerUp();
    expect(
      Object.values(binding.patchOf(readingEvent(running))?.frames ?? {}),
    ).toEqual(['on', 'on', 'on']);
    const cold = withRecords(running, {
      reactor: { ...running.reactor, electric: 0, level: 0 },
    });
    expect(
      Object.values(binding.patchOf(readingEvent(cold))?.frames ?? {}),
    ).toEqual(['off', 'off', 'off']);
  });

  it('names only fixtures of the weapons hull section', async () => {
    const ids = idsOf(binding.patchOf(readingEvent((await ship()).powerUp())));
    expect(fixturesOfHullSections(['weapons'])).toEqual(
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
    const fired = withRecords(reading, {
      weapons: {
        status: 'charged',
        charge: 5e6,
        shots: 3,
        hits: 2,
        lastShot: null,
      },
    });
    const value = (name: string) =>
      binding.readouts.find((readout) => readout.name === name)?.read(fired);
    expect(value('weapons-status')).toBe('charged');
    expect(value('capacitor-charge')).toBe(5);
    expect(value('shots')).toBe(3);
    expect(value('hits')).toBe(2);
  });
});
