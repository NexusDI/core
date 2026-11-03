import type { MapDefinition, MapTrigger } from '@nexusdi/meridian-systems/maps';
import type { Nexus, Scope } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeckEvent } from '../state/contracts.js';
import { app, mapOf } from './test-support.js';

import { SCENE } from './index.js';

const cleanup: (Scope | Nexus)[] = [];
afterEach(async () => {
  for (const item of cleanup.splice(0).reverse()) {
    await item[Symbol.asyncDispose]();
  }
  vi.restoreAllMocks();
});

/** Opens a map made of the triggers over a fake source. */
async function run(
  triggers: readonly MapTrigger[],
  fields: Partial<MapDefinition> = {},
) {
  const harness = await app({
    maps: { 'test-map': mapOf({ triggers, ...fields }) },
    doors: ['airlock-outer', 'habitat-airlock'],
  });
  cleanup.push(harness.nexus);
  const scope = await harness.open('test-map');
  cleanup.push(scope);
  return {
    ...harness,
    scope,
    cues: () => scope.get(SCENE).cues(),
    push: (event: DeckEvent) => harness.source.push(event),
  };
}

const reading = (values: Record<string, unknown>): DeckEvent => ({
  type: 'reading',
  reading: values,
});

describe('the conditions', () => {
  it('fires a select trigger for the id it names and no other', async () => {
    const { push, cues } = await run([
      {
        id: 'pick',
        when: { select: 'bridge' },
        then: [{ announce: 'Bridge.' }],
      },
    ]);
    push({ type: 'select', id: 'habitat' });
    expect(cues()).toEqual([]);
    push({ type: 'select', id: 'bridge' });
    push({ type: 'select', id: 'bridge' });
    expect(cues()).toHaveLength(2);
  });

  it('reads a record with is, above and below', async () => {
    const { push, cues } = await run([
      {
        id: 'charged',
        when: { record: 'ftl.status', is: 'charged' },
        then: [{ announce: 'charged' }],
      },
      {
        id: 'hot',
        when: { record: 'reactor.thermal', above: 100 },
        then: [{ announce: 'hot' }],
      },
      {
        id: 'cold',
        when: { record: 'compartments.reactor-bay.pressure', below: 50 },
        then: [{ announce: 'cold' }],
      },
    ]);
    push(
      reading({
        ftl: { status: 'spooling' },
        reactor: { thermal: 90 },
        compartments: { 'reactor-bay': { pressure: 101 } },
      }),
    );
    expect(cues()).toEqual([]);
    push(
      reading({
        ftl: { status: 'charged' },
        reactor: { thermal: 120 },
        compartments: { 'reactor-bay': { pressure: 20 } },
      }),
    );
    expect(
      cues().map((cue) => (cue.kind === 'announce' ? cue.text : '')),
    ).toEqual(['charged', 'hot', 'cold']);
  });

  it('fires a record trigger once per crossing and again after it drops back', async () => {
    const { push, cues } = await run([
      {
        id: 'hot',
        when: { record: 'reactor.thermal', above: 100 },
        then: [{ announce: 'hot' }],
      },
      {
        id: 'low',
        when: { record: 'reactor.level', below: 10 },
        then: [{ announce: 'low' }],
      },
    ]);
    const at = (thermal: number, level: number) =>
      push(reading({ reactor: { thermal, level } }));
    at(101, 50);
    at(150, 50);
    expect(cues()).toHaveLength(1);
    at(90, 50);
    at(101, 50);
    expect(cues()).toHaveLength(2);
    at(101, 5);
    at(101, 4);
    expect(cues()).toHaveLength(3);
    at(101, 12);
    at(101, 9);
    expect(cues()).toHaveLength(4);
  });

  it('fires a record trigger whose fact already held when the first frame arrives', async () => {
    const { push, cues } = await run([
      {
        id: 'on',
        when: { record: 'reactor.tripped', is: true },
        then: [{ announce: 'tripped' }],
      },
    ]);
    push(reading({ reactor: { tripped: true } }));
    expect(cues()).toHaveLength(1);
  });

  it('fires an alarm trigger when the store raises the alarm in the room', async () => {
    const { source, cues } = await run([
      {
        id: 'fire',
        when: { alarm: 'FIRE', room: 'bridge' },
        then: [{ announce: 'fire' }],
      },
    ]);
    source.push({
      type: 'state',
      patch: { alarms: [{ code: 'FIRE', subject: 'habitat' }] },
    });
    expect(cues()).toEqual([]);
    source.push({
      type: 'state',
      patch: { alarms: [{ code: 'FIRE', subject: 'bridge' }] },
    });
    source.push({
      type: 'state',
      patch: {
        alarms: [
          { code: 'FIRE', subject: 'bridge' },
          { code: 'HYPOXIA', subject: 'bridge' },
        ],
      },
    });
    expect(cues()).toHaveLength(1);
    source.push({ type: 'state', patch: { alarms: [] } });
    source.push({
      type: 'state',
      patch: { alarms: [{ code: 'FIRE', subject: 'bridge' }] },
    });
    expect(cues()).toHaveLength(2);
  });

  it('fires an alarm trigger for an alarm the map’s start state raised', async () => {
    const { cues } = await run(
      [
        {
          id: 'fire',
          when: { alarm: 'FIRE', room: 'bridge' },
          then: [{ announce: 'fire' }],
        },
      ],
      { start: { rooms: { bridge: { alarm: 'FIRE' } } } },
    );
    expect(cues()).toHaveLength(1);
  });

  it('narrows a refused trigger by door, room and system', async () => {
    const { push, cues } = await run([
      {
        id: 'outer',
        when: { refused: 'MERIDIAN_INTERLOCK', door: 'airlock-outer' },
        then: [{ announce: 'outer' }],
      },
      {
        id: 'any',
        when: { refused: 'MERIDIAN_INTERLOCK' },
        then: [{ announce: 'any' }],
      },
      {
        id: 'system',
        when: { refused: 'MERIDIAN_POWER_BUDGET', system: 'weapons' },
        then: [{ announce: 'system' }],
      },
    ]);
    const text = () =>
      cues().map((cue) => (cue.kind === 'announce' ? cue.text : ''));
    push({
      type: 'answer',
      refused: 'MERIDIAN_INTERLOCK',
      door: 'habitat-airlock',
    });
    expect(text()).toEqual(['any']);
    push({
      type: 'answer',
      refused: 'MERIDIAN_INTERLOCK',
      door: 'airlock-outer',
    });
    expect(text()).toEqual(['any', 'outer', 'any']);
    push({ type: 'answer', refused: 'MERIDIAN_POWER_BUDGET', system: 'comms' });
    push({ type: 'answer' });
    push({
      type: 'answer',
      refused: 'MERIDIAN_POWER_BUDGET',
      system: 'weapons',
    });
    expect(text()).toEqual(['any', 'outer', 'any', 'system']);
  });

  it('reads provider, loaded, objective and passed conditions from the graph, the run and the progress', async () => {
    const { push, cues } = await run([
      {
        id: 'built',
        when: { provider: 'reactor-bay.vessel', event: 'construct' },
        then: [{ announce: 'built' }],
      },
      {
        id: 'loaded',
        when: { loaded: 'FtlDrive' },
        then: [{ announce: 'loaded' }],
      },
      {
        id: 'pass',
        when: { objective: 'wire-it', status: 'pass' },
        then: [{ announce: 'pass' }],
      },
      {
        id: 'passed',
        when: { passed: 'first-light' },
        then: [{ announce: 'passed' }],
      },
    ]);
    push({
      type: 'graph',
      modules: ['Reactor'],
      providers: { 'reactor-bay.vessel': ['init'] },
    });
    push({ type: 'objective', objective: 'wire-it', status: 'fail' });
    push({ type: 'passed', missions: [] });
    expect(cues()).toEqual([]);
    push({
      type: 'graph',
      modules: ['Reactor', 'FtlDrive'],
      providers: { 'reactor-bay.vessel': ['init', 'construct'] },
    });
    push({ type: 'objective', objective: 'wire-it', status: 'pass' });
    push({ type: 'passed', missions: ['first-light'] });
    push({
      type: 'graph',
      modules: ['Reactor', 'FtlDrive'],
      providers: { 'reactor-bay.vessel': ['init', 'construct'] },
    });
    expect(
      cues().map((cue) => (cue.kind === 'announce' ? cue.text : '')),
    ).toEqual(['built', 'loaded', 'pass', 'passed']);
  });

  it('skips a condition and an effect it does not know, with a development warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { source, cues } = await run([
      {
        id: 'odd-condition',
        when: { tide: 'high' } as never,
        then: [{ announce: 'never' }],
      },
      {
        id: 'odd-effect',
        when: { enter: true },
        then: [{ levitate: 'bridge' } as never, { announce: 'kept' }],
      },
    ]);
    source.push({ type: 'select', id: 'bridge' });
    expect(cues()).toEqual([{ kind: 'announce', text: 'kept' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('odd-condition'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('levitate'));
  });
});

describe('the effects', () => {
  it('holds a fixture frame, a door, a room and a conduit under the trigger', async () => {
    const { push, state } = await run([
      {
        id: 'stage',
        when: { select: 'bridge' },
        then: [
          { set: 'bridge.helm', state: 'off' },
          { set: 'airlock-outer', state: 'open' },
          { room: 'habitat', light: 'alarm' },
          { conduit: 'power.life-support.forward', state: 'broken' },
        ],
      },
    ]);
    push({ type: 'select', id: 'bridge' });
    const snapshot = state.snapshot();
    expect(snapshot.frames['bridge.helm']).toBe('off');
    expect(snapshot.doors['airlock-outer']).toEqual({ state: 'open' });
    expect(snapshot.frames['airlock-outer']).toBeUndefined();
    expect(snapshot.rooms['habitat']).toBe('alarm');
    expect(snapshot.conduits['power.life-support.forward']).toEqual({
      state: 'broken',
      level: 0,
    });
    expect(state.heldBy('bridge.helm')).toBe('test-map:stage');
  });

  it('keeps a hold over the bindings and shows the base again on release', async () => {
    const { push, source, state } = await run([
      {
        id: 'dark',
        when: { select: 'bridge' },
        then: [{ room: 'bridge', light: 'unpowered' }],
      },
      {
        id: 'lift',
        when: { select: 'habitat' },
        then: [{ release: 'dark' }],
      },
    ]);
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    push({ type: 'select', id: 'bridge' });
    expect(state.snapshot().rooms['bridge']).toBe('unpowered');
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    expect(state.snapshot().rooms['bridge']).toBe('unpowered');
    push({ type: 'select', id: 'habitat' });
    expect(state.snapshot().rooms['bridge']).toBe('powered');
    expect(state.heldBy('bridge')).toBeUndefined();
  });

  it('moves the camera target with the zoom the effect names', async () => {
    const { push, state } = await run([
      {
        id: 'look',
        when: { select: 'bridge' },
        then: [{ camera: 'airlock-outer', zoom: 'room' }, { camera: 'helm' }],
      },
    ]);
    push({ type: 'select', id: 'bridge' });
    expect(state.snapshot().camera).toEqual({ focus: 'helm' });
  });

  it('raises callouts with readouts or text and announcements as cues in order', async () => {
    const { push, cues } = await run([
      {
        id: 'cues',
        when: { select: 'bridge' },
        then: [
          { callout: 'bridge', show: ['a', 'b'] },
          { callout: 'helm', text: 'Hello' },
          { announce: 'Done' },
        ],
      },
    ]);
    push({ type: 'select', id: 'bridge' });
    expect(cues()).toEqual([
      { kind: 'callout', at: 'bridge', show: ['a', 'b'] },
      { kind: 'callout', at: 'helm', text: 'Hello' },
      { kind: 'announce', text: 'Done' },
    ]);
  });

  it('merges the holds of one trigger that fires twice', async () => {
    const { push, state } = await run([
      {
        id: 'a',
        when: { select: 'bridge' },
        then: [{ room: 'bridge', light: 'unpowered' }],
      },
      {
        id: 'b',
        when: { select: 'habitat' },
        then: [{ room: 'habitat', light: 'unpowered' }],
      },
    ]);
    push({ type: 'select', id: 'bridge' });
    push({ type: 'select', id: 'habitat' });
    expect(state.snapshot().held).toEqual({
      bridge: 'test-map:a',
      habitat: 'test-map:b',
    });
  });
});
