import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { check, defineModule, Nexus } from '@nexusdi/core';
import type { Scope } from '@nexusdi/core';
import type { MapDefinition } from '@nexusdi/meridian-systems/maps';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeckState } from '../state/deck-state.module.js';
import { FakeSource, OPTIONS } from '../test-support.js';
import type { DeckMapsOptions } from './contracts.js';
import { app, mapOf } from './test-support.js';

import { DeckMaps, MAP, SCENE, UnknownMapError } from './index.js';

const mapsDir = join(
  import.meta.dirname,
  '../../../../examples/meridian-systems/deck/maps',
);
const airlock = JSON.parse(
  readFileSync(join(mapsDir, 'console-airlock.map.json'), 'utf8'),
) as MapDefinition;

const cleanup: (Scope | Nexus)[] = [];
afterEach(async () => {
  for (const item of cleanup.splice(0).reverse()) {
    await item[Symbol.asyncDispose]();
  }
  vi.restoreAllMocks();
});

async function opened(options: DeckMapsOptions, source?: FakeSource) {
  const harness = await app(options, source);
  cleanup.push(harness.nexus);
  return harness;
}

describe('DeckMaps over a configured DeckState', () => {
  it('resolves MAP and SCENE from a scope whose request names a map', async () => {
    const { open } = await opened({ maps: { 'console-airlock': airlock } });
    const scope = await open('console-airlock');
    cleanup.push(scope);
    expect(scope.get(MAP)).toBe(airlock);
    expect(scope.get(SCENE).map).toBe(airlock);
  });

  it('loads a map from a function once and shares it across scopes', async () => {
    const load = vi.fn(async () => airlock);
    const { open } = await opened({ maps: { 'console-airlock': load } });
    const first = await open('console-airlock');
    const second = await open('console-airlock');
    cleanup.push(first, second);
    expect(first.get(MAP)).toBe(airlock);
    expect(second.get(MAP)).toBe(airlock);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refuses a scope whose request names no map, or one the options lack', async () => {
    const { nexus } = await opened({ maps: { 'console-airlock': airlock } });
    await expect(nexus.createScope({ request: {} }))
      .rejects.toMatchObject({
        errors: [
          expect.objectContaining({ cause: expect.any(UnknownMapError) }),
        ],
      })
      .catch(async () => {
        await expect(nexus.createScope({ request: {} })).rejects.toBeDefined();
      });
    await expect(
      nexus.createScope({ request: { map: 'nowhere' } }),
    ).rejects.toBeDefined();
  });

  it('names the known maps in UnknownMapError', () => {
    const error = new UnknownMapError('nowhere', ['a', 'b']);
    expect(error.message).toContain('"nowhere"');
    expect(error.message).toContain('a, b');
    expect(new UnknownMapError(undefined, ['a']).message).toContain('no map');
  });

  it('fails the check when DeckMaps is not loaded over a DeckState', () => {
    expect(() => check(DeckMaps.forRoot({ maps: {} }))).toThrowError(
      expect.objectContaining({ code: 'NEXUS_BLUEPRINT_INVALID' }),
    );
  });

  it('refuses a load whose import is not in the graph', async () => {
    const nexus = await Nexus.create(defineModule({ name: 'Root' }));
    cleanup.push(nexus);
    await expect(
      nexus.load(DeckMaps.forRoot({ maps: {} }), {
        imports: [DeckState.forRoot(OPTIONS)],
      }),
    ).rejects.toMatchObject({ code: 'NEXUS_LOAD_IMPORT' });
  });
});

describe('MapScene', () => {
  it('holds the start state under the map id and aims the camera', async () => {
    const { open, state } = await opened({
      maps: { 'console-airlock': airlock },
      doors: ['habitat-airlock', 'airlock-outer'],
    });
    const scope = await open('console-airlock');
    cleanup.push(scope);
    const snapshot = state.snapshot();
    expect(snapshot.doors['airlock-outer']).toEqual({ state: 'closed' });
    expect(snapshot.rooms['shuttle-bay']).toBe('unpowered');
    expect(state.heldBy('airlock-outer')).toBe('console-airlock');
    expect(snapshot.camera).toEqual({
      deck: 'main',
      focus: 'airlock',
      zoom: 'section',
    });
  });

  it('holds a fixture frame and a room alarm from the start state', async () => {
    const map = mapOf({
      start: {
        fixtures: { 'bridge.helm': 'off' },
        rooms: { bridge: { alarm: 'FIRE' } },
      },
    });
    const { open, state } = await opened({ maps: { m: map } });
    cleanup.push(await open('m'));
    const snapshot = state.snapshot();
    expect(snapshot.frames['bridge.helm']).toBe('off');
    expect(snapshot.fixtures['bridge.helm']).toBe('offline');
    expect(snapshot.rooms['bridge']).toBe('alarm');
    expect(snapshot.alarms).toEqual([{ code: 'FIRE', subject: 'bridge' }]);
  });

  it('releases every hold when the scope disposes, and leaves other holds', async () => {
    const map = mapOf({
      start: { rooms: { bridge: { light: 'unpowered' } } },
      triggers: [
        {
          id: 'dim',
          when: { enter: true },
          then: [{ room: 'habitat', light: 'unpowered' }],
        },
      ],
    });
    const { open, state } = await opened({ maps: { 'test-map': map } });
    state.hold('other', { rooms: { quarters: 'alarm' } });
    const scope = await open('test-map');
    expect(state.snapshot().held).toEqual({
      bridge: 'test-map',
      habitat: 'test-map:dim',
      quarters: 'other',
    });
    await scope[Symbol.asyncDispose]();
    expect(state.snapshot().held).toEqual({ quarters: 'other' });
  });

  it('fires enter triggers when the scope opens', async () => {
    const map = mapOf({
      triggers: [
        {
          id: 'welcome',
          when: { enter: true },
          then: [
            { announce: 'Welcome aboard.' },
            { callout: 'bridge', text: 'Start here.' },
            { camera: 'helm', zoom: 'room' },
          ],
        },
      ],
    });
    const { open, state } = await opened({ maps: { 'test-map': map } });
    const scope = await open('test-map');
    cleanup.push(scope);
    expect(scope.get(SCENE).cues()).toEqual([
      { kind: 'announce', text: 'Welcome aboard.' },
      { kind: 'callout', at: 'bridge', text: 'Start here.' },
    ]);
    expect(state.snapshot().camera).toEqual({ focus: 'helm', zoom: 'room' });
  });

  it('tells a cue listener about later cues and stops on request', async () => {
    const map = mapOf({
      triggers: [
        {
          id: 'pick',
          when: { select: 'bridge' },
          then: [{ callout: 'bridge', show: ['pressure'] }],
        },
      ],
    });
    const { open, source } = await opened({ maps: { 'test-map': map } });
    const scope = await open('test-map');
    cleanup.push(scope);
    const seen: unknown[] = [];
    const stop = scope.get(SCENE).onCue((cue) => seen.push(cue));
    source.push({ type: 'select', id: 'bridge' });
    stop();
    source.push({ type: 'select', id: 'bridge' });
    expect(seen).toEqual([
      { kind: 'callout', at: 'bridge', show: ['pressure'] },
    ]);
  });

  it('shows a map of a newer schema with no triggers and warns with the version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = mapOf({
      $schema: 'https://nexusdi.dev/schemas/meridian-map/2.json',
      start: { rooms: { bridge: { light: 'unpowered' } } },
      triggers: [
        {
          id: 'welcome',
          when: { enter: true },
          then: [{ announce: 'Hello.' }],
        },
      ],
    });
    const { open, state } = await opened({ maps: { 'test-map': map } });
    const scope = await open('test-map');
    cleanup.push(scope);
    expect(scope.get(SCENE).cues()).toEqual([]);
    expect(state.snapshot().rooms['bridge']).toBe('unpowered');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('version 2'));
  });
});

describe('the one source', () => {
  it('lets a source that has not started leave the store alone', async () => {
    const source = new FakeSource();
    const { open, state } = await opened(
      { maps: { 'test-map': mapOf() } },
      source,
    );
    cleanup.push(await open('test-map'));
    expect(state.snapshot().alarms).toEqual([]);
  });
});
