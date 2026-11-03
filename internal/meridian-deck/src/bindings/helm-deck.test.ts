import { afterEach, describe, expect, it } from 'vitest';

import { HelmDeckBinding } from './helm-deck.js';
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

const binding = new HelmDeckBinding();

describe('HelmDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('turns the bridge consoles on with the reactor and off without it', async () => {
    const running = (await ship()).powerUp();
    expect(
      binding.patchOf(readingEvent(running))?.frames?.['bridge.helm'],
    ).toBe('on');
    const cold = withRecords(running, {
      reactor: { ...running.reactor, electric: 0, level: 0 },
    });
    expect(binding.patchOf(readingEvent(cold))?.frames?.['bridge.helm']).toBe(
      'off',
    );
  });

  it('names only consoles of the bridge hull section, never the command chair', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    const ids = idsOf(patch);
    expect(fixturesOfHullSections(['bridge'])).toEqual(
      expect.arrayContaining(ids.frames),
    );
    expect(ids.frames).not.toContain('bridge.command-chair');
    expect([ids.rooms, ids.doors, ids.conduits, ids.alarms]).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it('reads its readouts from the frame in degrees', async () => {
    const reading = (await ship()).powerUp();
    const turned = withRecords(reading, {
      helm: { attitude: Math.PI / 2, rate: Math.PI / 180, torque: 2000 },
    });
    const value = (name: string) =>
      binding.readouts.find((readout) => readout.name === name)?.read(turned);
    expect(value('heading')).toBeCloseTo(90);
    expect(value('turn-rate')).toBeCloseTo(1);
    expect(value('thruster-torque')).toBe(2);
    expect(value('course')).toBeCloseTo(
      (turned.setpoints.helm.heading * 180) / Math.PI,
    );
  });
});
