import { afterEach, describe, expect, it } from 'vitest';

import { SafetyDeckBinding } from './safety-deck.js';
import { TestShip, idsOf, readingEvent, withRecords } from './test-support.js';

const ships: TestShip[] = [];
async function ship() {
  const made = await TestShip.start();
  ships.push(made);
  return made;
}
afterEach(async () => {
  for (const made of ships.splice(0)) await made.dispose();
});

const binding = new SafetyDeckBinding();

/** The frame with the alarms replaced. */
async function alarmed(...alarms: { code: string; subject: string }[]) {
  const reading = (await ship()).powerUp();
  return withRecords(reading, {
    safety: {
      ...reading.safety,
      alarms: alarms.map((alarm) => ({
        ...alarm,
        acknowledged: false,
      })) as never,
    },
  });
}

describe('SafetyDeck', () => {
  it('answers nothing for an event that is not a reading', () => {
    expect(binding.patchOf({ type: 'state', patch: {} })).toBeUndefined();
  });

  it('sends an empty alarm list on a quiet ship, so the previous alarms clear', async () => {
    const patch = binding.patchOf(readingEvent((await ship()).powerUp()));
    expect(patch?.alarms).toEqual([]);
    expect(patch?.rooms).toEqual({});
  });

  it('sets every door of the ship from the snapshot', async () => {
    const reading = (await ship()).powerUp();
    const patch = binding.patchOf(readingEvent(reading));
    expect(Object.keys(patch?.doors ?? {})).toHaveLength(16);
    expect(patch?.doors?.['bridge-habitat']).toEqual({ state: 'closed' });
    const open = withRecords(reading, {
      setpoints: {
        ...reading.setpoints,
        safety: {
          ...reading.setpoints.safety,
          doors: { ...reading.setpoints.safety.doors, 'bridge-habitat': true },
        },
      },
    });
    expect(
      binding.patchOf(readingEvent(open))?.doors?.['bridge-habitat'],
    ).toEqual({ state: 'open' });
  });

  it('lights the alarmed room and lists the alarm', async () => {
    const patch = binding.patchOf(
      readingEvent(await alarmed({ code: 'FIRE', subject: 'habitat' })),
    );
    expect(patch?.rooms).toEqual({ habitat: 'alarm' });
    expect(patch?.alarms).toEqual([{ code: 'FIRE', subject: 'habitat' }]);
  });

  it('closes the doors of a decompressing room with the cause', async () => {
    const patch = binding.patchOf(
      readingEvent(
        await alarmed({ code: 'DECOMPRESSION', subject: 'airlock' }),
      ),
    );
    expect(patch?.doors?.['habitat-airlock']).toEqual({
      state: 'closed',
      cause: 'DECOMPRESSION',
    });
    expect(patch?.doors?.['bridge-habitat']).toEqual({ state: 'closed' });
  });

  it('marks the conduits of a shed load shed and lights no room', async () => {
    const patch = binding.patchOf(
      readingEvent(await alarmed({ code: 'LOAD_SHED', subject: 'shields' })),
    );
    expect(patch?.rooms).toEqual({});
    expect(patch?.conduits?.['power.shields.dorsal']).toEqual({
      state: 'shed',
      level: 0,
    });
    expect(patch?.conduits).not.toHaveProperty('power.comms');
  });

  it('lights no room for an alarm on the reactor', async () => {
    const patch = binding.patchOf(
      readingEvent(await alarmed({ code: 'REACTOR_TRIP', subject: 'reactor' })),
    );
    expect(patch?.rooms).toEqual({});
    expect(patch?.alarms).toEqual([
      { code: 'REACTOR_TRIP', subject: 'reactor' },
    ]);
  });

  it('lists an unknown code and lights nothing for it', async () => {
    const patch = binding.patchOf(
      readingEvent(await alarmed({ code: 'WARP_BUBBLE', subject: 'bridge' })),
    );
    expect(patch?.alarms).toEqual([{ code: 'WARP_BUBBLE', subject: 'bridge' }]);
    expect(patch?.rooms).toEqual({});
    expect(patch?.conduits).toEqual({});
  });

  it('names only doors, rooms, conduits of a load and alarms', async () => {
    const patch = binding.patchOf(
      readingEvent(await alarmed({ code: 'FIRE', subject: 'habitat' })),
    );
    const ids = idsOf(patch);
    expect([ids.fixtures, ids.frames]).toEqual([[], []]);
  });

  it('reads its frame readouts', async () => {
    const reading = await alarmed({ code: 'FIRE', subject: 'habitat' });
    const value = (name: string) => {
      const readout = binding.readouts.find((entry) => entry.name === name);
      return readout?.source === 'reading' ? readout.read(reading) : undefined;
    };
    expect(value('alarm-list')).toBe('FIRE habitat');
    expect(value('door-state')).toBe(0);
    expect(value('fire-intensity')).toBe(0);
    expect(value('flood-released')).toBe(0);
    expect(value('pressure-difference')).toBeCloseTo(
      reading.compartments.airlock.pressure / 1000,
    );
  });

  it('reads the three event readouts from their events', () => {
    const find = (name: string) =>
      binding.readouts.find((entry) => entry.name === name);
    const answer = find('interlock-chain');
    const modules = find('graph-modules');
    const steps = find('startup-steps');
    expect(answer?.source).toBe('answer');
    expect(modules?.source).toBe('graph');
    expect(steps?.source).toBe('graph');
    if (answer?.source === 'answer') {
      expect(answer.read({ type: 'answer' })).toBeNull();
      expect(
        answer.read({ type: 'answer', refused: 'MERIDIAN_INTERLOCK' }),
      ).toBe('MERIDIAN_INTERLOCK');
    }
    const graph = {
      type: 'graph' as const,
      modules: ['Root', 'Ship'],
      providers: { REACTOR: ['construct', 'init'], HELM: ['construct'] },
    };
    if (modules?.source === 'graph') expect(modules.read(graph)).toBe(2);
    if (steps?.source === 'graph') expect(steps.read(graph)).toBe(3);
  });
});
