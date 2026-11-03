import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeSource } from '../test-support.js';

import type {
  DeckChange,
  DeckEvent,
  DeckPatch,
  IDeckBinding,
} from './contracts.js';
import { DeckStateStore } from './deck-state-store.js';

const EMPTY = {
  rooms: {},
  fixtures: {},
  frames: {},
  doors: {},
  conduits: {},
  alarms: [],
  held: {},
  camera: undefined,
};

function build(bindings: IDeckBinding[] = []) {
  const source = new FakeSource();
  const store = new DeckStateStore(source, bindings);
  store.onInit();
  return { source, store };
}

// A package that owns an event adds it to the map (P2), and a test adds the two it pushes.
declare module './contracts.js' {
  interface DeckEventMap {
    drill: { readonly room: string };
    noise: { readonly volume: number };
    sweep: { readonly n: number };
  }
}

describe('DeckStateStore', () => {
  it('applies the patch of a state event and keeps what it does not name', () => {
    const { source, store } = build();
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    source.push({
      type: 'state',
      patch: {
        rooms: { engineering: 'alarm' },
        fixtures: { reactor: 'offline' },
      },
    });
    expect(store.snapshot()).toMatchObject({
      rooms: { bridge: 'powered', engineering: 'alarm' },
      fixtures: { reactor: 'offline' },
    });
  });

  it('tells each listener the patch and the snapshot, and stops after the unsubscribe', () => {
    const { source, store } = build();
    const heard: DeckChange[] = [];
    const stop = store.subscribe((change) => heard.push(change));
    source.push({ type: 'state', patch: { rooms: { bridge: 'unpowered' } } });
    stop();
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    expect(heard).toHaveLength(1);
    expect(heard[0]?.patch.rooms).toEqual({ bridge: 'unpowered' });
    expect(heard[0]?.snapshot.rooms).toEqual({ bridge: 'unpowered' });
  });

  it('hands an event of an unknown type to the bindings and applies the patch one returns', () => {
    const known: IDeckBinding = {
      patchOf: (event) =>
        event.type === 'drill'
          ? { rooms: { [event.room]: 'alarm' } }
          : undefined,
    };
    const silent: IDeckBinding = { patchOf: vi.fn(() => undefined) };
    const { source, store } = build([silent, known]);
    source.push({ type: 'drill', room: 'airlock' });
    expect(store.snapshot().rooms).toEqual({ airlock: 'alarm' });
    expect(silent.patchOf).toHaveBeenCalledOnce();
  });

  it('ignores an event of an unknown type that no binding reads', () => {
    const { source, store } = build();
    expect(() => source.push({ type: 'noise', volume: 11 })).not.toThrow();
    expect(store.snapshot()).toEqual(EMPTY);
  });

  it('leaves the source at dispose', () => {
    const { source, store } = build();
    store[Symbol.dispose]();
    expect(source.listeners.size).toBe(0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('frames, doors, conduits and alarms', () => {
  it('stores each channel and keeps what a later patch does not name', () => {
    const { source, store } = build();
    source.push({
      type: 'state',
      patch: {
        frames: { 'bridge.helm': 'on' },
        doors: {
          'bridge-habitat': { state: 'closed', cause: 'DECOMPRESSION' },
        },
        conduits: { 'power.main': { state: 'flowing', level: 0.8 } },
      },
    });
    source.push({
      type: 'state',
      patch: { conduits: { 'power.aux': { state: 'broken', level: 0 } } },
    });
    const snap = store.snapshot();
    expect(snap.frames).toEqual({ 'bridge.helm': 'on' });
    expect(snap.doors['bridge-habitat']).toEqual({
      state: 'closed',
      cause: 'DECOMPRESSION',
    });
    expect(snap.conduits).toEqual({
      'power.main': { state: 'flowing', level: 0.8 },
      'power.aux': { state: 'broken', level: 0 },
    });
  });

  it('replaces the alarm list with each patch that names one', () => {
    const { source, store } = build();
    source.push({
      type: 'state',
      patch: { alarms: [{ code: 'FIRE', subject: 'engineering' }] },
    });
    source.push({
      type: 'state',
      patch: { alarms: [{ code: 'UNKNOWN_CODE', subject: 'bridge' }] },
    });
    expect(store.snapshot().alarms).toEqual([
      { code: 'UNKNOWN_CODE', subject: 'bridge' },
    ]);
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    expect(store.snapshot().alarms).toHaveLength(1);
    source.push({ type: 'state', patch: { alarms: [] } });
    expect(store.snapshot().alarms).toEqual([]);
  });
});

describe('the glow a frame implies', () => {
  it.each([
    ['on', 'online'],
    ['off', 'offline'],
    ['damaged', 'offline'],
  ] as const)('derives %s to %s when the patch sets no glow', (frame, glow) => {
    const { source, store } = build();
    source.push({ type: 'state', patch: { frames: { 'bridge.helm': frame } } });
    expect(store.snapshot().fixtures['bridge.helm']).toBe(glow);
  });

  it('keeps a glow the patch sets', () => {
    const { source, store } = build();
    source.push({
      type: 'state',
      patch: {
        frames: { 'ftl.drive': 'on' },
        fixtures: { 'ftl.drive': 'standby' },
      },
    });
    expect(store.snapshot().fixtures['ftl.drive']).toBe('standby');
  });

  it.each(['open', 'closed', 'default'] as const)(
    'leaves the glow of a %s frame unset',
    (frame) => {
      const { source, store } = build();
      source.push({ type: 'state', patch: { frames: { x: frame } } });
      expect(store.snapshot().fixtures).toEqual({});
    },
  );

  it('lets chart-room.plot-table follow a powered and an unpowered room with a default frame', () => {
    for (const light of ['powered', 'unpowered'] as const) {
      const { source, store } = build();
      source.push({
        type: 'state',
        patch: {
          rooms: { 'chart-room': light },
          frames: { 'chart-room.plot-table': 'default' },
        },
      });
      const snap = store.snapshot();
      expect(snap.rooms['chart-room']).toBe(light);
      expect(snap.frames['chart-room.plot-table']).toBe('default');
      expect(snap.fixtures['chart-room.plot-table']).toBeUndefined();
    }
  });

  it('puts the derived glow in the patch the listeners hear', () => {
    const { source, store } = build();
    const heard: DeckChange[] = [];
    store.subscribe((change) => heard.push(change));
    source.push({ type: 'state', patch: { frames: { a: 'off' } } });
    expect(heard[0]?.patch.fixtures).toEqual({ a: 'offline' });
  });
});

describe('holds', () => {
  it('lays a hold over the base and drops it on release', () => {
    const { source, store } = build();
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    store.hold('drill', { rooms: { bridge: 'alarm' } });
    expect(store.snapshot().rooms.bridge).toBe('alarm');
    expect(store.heldBy('bridge')).toBe('drill');
    store.release('drill');
    expect(store.snapshot().rooms.bridge).toBe('powered');
    expect(store.heldBy('bridge')).toBeUndefined();
  });

  it('keeps the base moving under a hold', () => {
    const { source, store } = build();
    store.hold('drill', { rooms: { bridge: 'alarm' } });
    source.push({
      type: 'state',
      patch: { rooms: { bridge: 'unpowered', galley: 'powered' } },
    });
    expect(store.snapshot().rooms).toEqual({
      bridge: 'alarm',
      galley: 'powered',
    });
    store.release('drill');
    expect(store.snapshot().rooms.bridge).toBe('unpowered');
  });

  it('lets the later hold win an id two holds set and falls back on release', () => {
    const { store } = build();
    store.hold('a', { rooms: { bridge: 'alarm' } });
    store.hold('b', { rooms: { bridge: 'unpowered' } });
    expect(store.snapshot().rooms.bridge).toBe('unpowered');
    expect(store.heldBy('bridge')).toBe('b');
    store.release('b');
    expect(store.snapshot().rooms.bridge).toBe('alarm');
    expect(store.heldBy('bridge')).toBe('a');
  });

  it('makes a repeated hold by one trigger the latest', () => {
    const { store } = build();
    store.hold('a', { rooms: { bridge: 'alarm' } });
    store.hold('b', { rooms: { bridge: 'unpowered' } });
    store.hold('a', { rooms: { bridge: 'powered' } });
    expect(store.snapshot().rooms.bridge).toBe('powered');
  });

  it('derives the glow of a held frame and replaces alarms with the later hold', () => {
    const { store } = build();
    store.hold('a', {
      frames: { x: 'off' },
      alarms: [{ code: 'FIRE', subject: 'x' }],
    });
    store.hold('b', { alarms: [{ code: 'BREACH', subject: 'y' }] });
    const snap = store.snapshot();
    expect(snap.fixtures.x).toBe('offline');
    expect(snap.alarms).toEqual([{ code: 'BREACH', subject: 'y' }]);
    expect(snap.held.x).toBe('a');
  });

  it('releases every hold at once', () => {
    const { store } = build();
    store.hold('a', { rooms: { bridge: 'alarm' } });
    store.hold('b', { doors: { d: { state: 'closed' } } });
    store.releaseAll();
    expect(store.snapshot()).toEqual(EMPTY);
  });

  it('sends one change per hold and per release, and none for a release of nothing', () => {
    const { store } = build();
    const heard: DeckChange[] = [];
    store.subscribe((change) => heard.push(change));
    store.hold('a', { rooms: { bridge: 'alarm' } });
    store.release('nobody');
    store.releaseAll();
    expect(heard).toHaveLength(2);
    expect(heard[0]?.patch).toEqual({ rooms: { bridge: 'alarm' } });
    expect(heard[1]?.patch).toEqual({});
    expect(heard[1]?.snapshot.held).toEqual({});
    store.releaseAll();
    expect(heard).toHaveLength(2);
  });
});

describe('the camera target', () => {
  it('replaces the target and tells the listeners', () => {
    const { store } = build();
    const heard: DeckChange[] = [];
    store.subscribe((change) => heard.push(change));
    store.setCameraTarget({ deck: 'deck-2', focus: 'bridge', zoom: 2 });
    store.setCameraTarget({ zoom: 'fit' });
    expect(store.snapshot().camera).toEqual({ zoom: 'fit' });
    expect(heard[0]?.snapshot.camera).toEqual({
      deck: 'deck-2',
      focus: 'bridge',
      zoom: 2,
    });
  });
});

describe('the patches of one event', () => {
  class HelmBinding implements IDeckBinding {
    patchOf(event: DeckEvent): DeckPatch | undefined {
      return event.type === 'sweep'
        ? { frames: { 'bridge.helm': 'on' }, rooms: { bridge: 'powered' } }
        : undefined;
    }
  }
  class PowerBinding implements IDeckBinding {
    patchOf(event: DeckEvent): DeckPatch | undefined {
      return event.type === 'sweep'
        ? { frames: { 'bridge.helm': 'off' }, rooms: { galley: 'powered' } }
        : undefined;
    }
  }

  it('applies the patches of all bindings as one change', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source, store } = build([new HelmBinding(), new PowerBinding()]);
    const heard: DeckChange[] = [];
    store.subscribe((change) => heard.push(change));
    source.push({ type: 'sweep', n: 1 });
    expect(heard).toHaveLength(1);
    expect(heard[0]?.patch.rooms).toEqual({
      bridge: 'powered',
      galley: 'powered',
    });
  });

  it('warns in development with both class names for an id two patches set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source } = build([new HelmBinding(), new PowerBinding()]);
    source.push({ type: 'sweep', n: 1 });
    expect(warn).toHaveBeenCalledOnce();
    const text = String(warn.mock.calls[0]?.[0]);
    expect(text).toContain('HelmBinding');
    expect(text).toContain('PowerBinding');
    expect(text).toContain('bridge.helm');
  });

  it('stays quiet in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source } = build([new HelmBinding(), new PowerBinding()]);
    source.push({ type: 'sweep', n: 1 });
    expect(warn).not.toHaveBeenCalled();
  });
});
