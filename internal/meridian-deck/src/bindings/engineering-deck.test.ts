import { afterEach, describe, expect, it } from 'vitest';

import { EngineeringDeckBinding } from './engineering-deck.js';
import {
  TestShip,
  conduitsOfKind,
  fixturesOfHullSections,
  idsOf,
  readingEvent,
  roomsOfSections,
  withRecords,
} from './test-support.js';

const SECTIONS = ['engineering', 'reactor-bay'];
const ships: TestShip[] = [];
async function ship() {
  const made = await TestShip.start();
  ships.push(made);
  return made;
}
afterEach(async () => {
  for (const made of ships.splice(0)) await made.dispose();
});

const binding = new EngineeringDeckBinding();

describe('EngineeringDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('darkens the engineering room and its machines on a cold reactor', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).advance(1)));
    expect(patch?.rooms).toEqual({ engineering: 'unpowered' });
    expect(Object.values(patch?.frames ?? {})).toEqual(Array(5).fill('off'));
  });

  it('lights them while the reactor runs', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    expect(patch?.rooms).toEqual({ engineering: 'powered' });
    expect(patch?.frames).toEqual({
      'engineering.control-desk': 'on',
      'engineering.power-router': 'on',
      'engineering.switchboards': 'on',
      'reactor-bay.vessel': 'on',
      'reactor-bay.coolant-pumps': 'on',
    });
  });

  it('names only ids of the engineering and reactor bay sections and the power and coolant conduits', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    const ids = idsOf(patch);
    expect(roomsOfSections(SECTIONS)).toEqual(
      expect.arrayContaining(ids.rooms),
    );
    expect(fixturesOfHullSections(SECTIONS)).toEqual(
      expect.arrayContaining(ids.frames),
    );
    const conduits = [...conduitsOfKind('power'), ...conduitsOfKind('coolant')];
    expect(conduits).toEqual(expect.arrayContaining(ids.conduits));
    expect([ids.fixtures, ids.doors, ids.alarms]).toEqual([[], [], []]);
  });

  it('leaves the room to the alarm when it is alarmed', async () => {
    const reading = (await ship()).powerUp();
    const alarmed = withRecords(reading, {
      safety: {
        ...reading.safety,
        alarms: [{ code: 'FIRE', subject: 'engineering', acknowledged: false }],
      },
    });
    expect(binding.patchOf(readingEvent(alarmed))?.rooms).toEqual({});
  });

  it('runs a power conduit as full as its allocation meets its demand', async () => {
    const reading = (await ship()).powerUp();
    const loads = reading.power.loads.map((load) =>
      load.id === 'shields' ? { ...load, demand: 100, allocated: 25 } : load,
    );
    const patch = binding.patchOf(
      readingEvent(
        withRecords(reading, { power: { ...reading.power, loads } }),
      ),
    );
    expect(patch?.conduits?.['power.shields.dorsal']).toEqual({
      state: 'flowing',
      level: 0.25,
    });
  });

  it('leaves the conduit of a shed load to the safety binding', async () => {
    const reading = (await ship()).powerUp();
    const patch = binding.patchOf(
      readingEvent(
        withRecords(reading, {
          power: { ...reading.power, shed: ['shields'] },
        }),
      ),
    );
    expect(Object.keys(patch?.conduits ?? {})).not.toContain(
      'power.shields.dorsal',
    );
    expect(Object.keys(patch?.conduits ?? {})).toContain('power.comms');
  });

  it('takes the coolant hue from the temperature: flowing, throttled within 100 K of the trip, broken at it', async () => {
    const reading = (await ship()).powerUp();
    const at = (temperature: number) =>
      binding.patchOf(
        readingEvent(withRecords(reading, { coolant: { temperature } })),
      )?.conduits?.['coolant.supply.port'];
    expect(at(500)).toEqual({ state: 'flowing', level: 0 });
    expect(at(1000)).toMatchObject({ state: 'flowing' });
    expect(at(1360)).toMatchObject({ state: 'shed' });
    expect(at(1450)).toEqual({ state: 'broken', level: 1 });
  });

  it('reads its readouts from the frame', async () => {
    const reading = (await ship()).powerUp();
    const value = (name: string) =>
      binding.readouts.find((readout) => readout.name === name)?.read(reading);
    expect(value('reactor-level')).toBeCloseTo(40);
    expect(value('electric-output')).toBeCloseTo(484);
    expect(value('coolant-temperature')).toBe(reading.coolant.temperature);
    expect(value('shield-allocation')).toBe(0);
  });
});
