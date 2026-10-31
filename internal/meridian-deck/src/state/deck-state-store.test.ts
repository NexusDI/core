import { describe, expect, it, vi } from 'vitest';

import { FakeSource } from '../test-support.js';

import type { DeckChange, DeckEvent, IDeckBinding } from './contracts.js';
import { DeckStateStore } from './deck-state-store.js';

function build(bindings: IDeckBinding[] = []) {
  const source = new FakeSource();
  const store = new DeckStateStore(source, bindings);
  store.onInit();
  return { source, store };
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
    expect(store.snapshot()).toEqual({
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
        (event as { type: string }).type === 'drill'
          ? { rooms: { airlock: 'alarm' } }
          : undefined,
    };
    const silent: IDeckBinding = { patchOf: vi.fn(() => undefined) };
    const { source, store } = build([silent, known]);
    source.push({ type: 'drill' } as unknown as DeckEvent);
    expect(store.snapshot().rooms).toEqual({ airlock: 'alarm' });
    expect(silent.patchOf).toHaveBeenCalledOnce();
  });

  it('ignores an event of an unknown type that no binding reads', () => {
    const { source, store } = build();
    expect(() =>
      source.push({ type: 'noise' } as unknown as DeckEvent),
    ).not.toThrow();
    expect(store.snapshot()).toEqual({ rooms: {}, fixtures: {} });
  });

  it('leaves the source at dispose', () => {
    const { source, store } = build();
    store[Symbol.dispose]();
    expect(source.listeners.size).toBe(0);
  });
});
