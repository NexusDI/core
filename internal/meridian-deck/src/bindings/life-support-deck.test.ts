import { afterEach, describe, expect, it } from 'vitest';

import { LifeSupportDeckBinding } from './life-support-deck.js';
import {
  TestShip,
  conduitsOfKind,
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

const binding = new LifeSupportDeckBinding();

describe('LifeSupportDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('keeps every room dark while the life-support load has no allocation', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).advance(1)));
    expect(new Set(Object.values(patch?.rooms ?? {}))).toEqual(
      new Set(['unpowered']),
    );
  });

  it('powers each pressurised room but engineering, and leaves the two bays unpowered', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    const rooms = patch?.rooms ?? {};
    expect(rooms['bridge']).toBe('powered');
    expect(rooms['reactor-bay']).toBe('powered');
    expect(rooms['shuttle-bay']).toBe('unpowered');
    expect(rooms['drone-bay']).toBe('unpowered');
    expect(rooms).not.toHaveProperty('engineering');
  });

  it('sheds the light of every room when the router gives life support nothing', async () => {
    const reading = (await ship()).powerUp();
    const loads = reading.power.loads.map((load) =>
      load.id === 'life-support' ? { ...load, allocated: 0 } : load,
    );
    const patch = binding.patchOf(
      readingEvent(
        withRecords(reading, { power: { ...reading.power, loads } }),
      ),
    );
    expect(patch?.rooms?.['bridge']).toBe('unpowered');
  });

  it('leaves an alarmed room to the safety binding', async () => {
    const reading = (await ship()).powerUp();
    const alarmed = withRecords(reading, {
      safety: {
        ...reading.safety,
        alarms: [{ code: 'FIRE', subject: 'habitat', acknowledged: false }],
      },
    });
    const rooms = binding.patchOf(readingEvent(alarmed))?.rooms ?? {};
    expect(rooms).not.toHaveProperty('habitat');
    expect(rooms['bridge']).toBe('powered');
  });

  it('names rooms and atmosphere conduits only', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    const ids = idsOf(patch);
    expect(conduitsOfKind('atmosphere')).toEqual(
      expect.arrayContaining(ids.conduits),
    );
    expect([ids.fixtures, ids.frames, ids.doors, ids.alarms]).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it('runs the pump conduit while a pump moves air and the vent conduit while a vent is open', async () => {
    const reading = (await ship()).powerUp();
    const idle = binding.patchOf(readingEvent(reading))?.conduits;
    expect(idle?.['atmosphere.pump']?.level).toBe(0);
    expect(idle?.['atmosphere.vent']?.level).toBe(0);
    const { lifeSupport } = reading.setpoints;
    const busy = binding.patchOf(
      readingEvent(
        withRecords(reading, {
          setpoints: {
            ...reading.setpoints,
            lifeSupport: {
              ...lifeSupport,
              pumps: { airlock: 'evacuate' },
              vents: { airlock: true },
            },
          },
        }),
      ),
    )?.conduits;
    expect(busy?.['atmosphere.pump']?.level).toBe(1);
    expect(busy?.['atmosphere.vent']?.level).toBe(1);
  });

  it('reads its readouts from the frame', async () => {
    const reading = (await ship()).powerUp();
    const value = (name: string) =>
      binding.readouts.find((readout) => readout.name === name)?.read(reading);
    expect(value('habitat-temperature')).toBe(
      reading.compartments.habitat.temperature,
    );
    expect(value('habitat-pressure')).toBeCloseTo(
      reading.compartments.habitat.pressure / 1000,
    );
    expect(value('oxygen-partial-pressure')).toBeCloseTo(
      (reading.compartments.habitat.pressure * 0.21) / 1000,
      0,
    );
    expect(value('heater-power')).toBeGreaterThanOrEqual(0);
    expect(value('airlock-pressure')).toBeCloseTo(
      reading.compartments.airlock.pressure / 1000,
    );
    expect(value('pump-mode')).toBe('off');
  });
});
