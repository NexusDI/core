import { describe, expect, it } from 'vitest';

import type { DeckEvent } from '../state/index.js';
import { DeckStateStore } from '../state/deck-state-store.js';

import { FakeDeckSource } from './index.js';

describe('FakeDeckSource', () => {
  it('sends pushed events to each listener until it unsubscribes', () => {
    const source = new FakeDeckSource();
    const heard: DeckEvent[] = [];
    const stop = source.subscribe((event) => heard.push(event));
    source.push({ type: 'state', patch: { rooms: { bridge: 'powered' } } });
    stop();
    source.state({ rooms: { bridge: 'alarm' } });
    expect(heard).toEqual([
      { type: 'state', patch: { rooms: { bridge: 'powered' } } },
    ]);
  });

  it('tells a first listener nothing, since no state exists yet', () => {
    const heard: DeckEvent[] = [];
    new FakeDeckSource().subscribe((event) => heard.push(event));
    expect(heard).toEqual([]);
  });

  it('gives a late listener the state so far as one state event', () => {
    const source = new FakeDeckSource();
    source.state({
      rooms: { bridge: 'powered' },
      frames: { helm: 'on' },
      alarms: [{ code: 'FIRE', subject: 'bridge' }],
    });
    source.state({
      rooms: { bridge: 'alarm' },
      doors: { d: { state: 'open' } },
    });
    source.state({ alarms: [] });
    const heard: DeckEvent[] = [];
    source.subscribe((event) => heard.push(event));
    expect(heard).toEqual([
      {
        type: 'state',
        patch: {
          rooms: { bridge: 'alarm' },
          fixtures: {},
          frames: { helm: 'on' },
          doors: { d: { state: 'open' } },
          conduits: {},
          alarms: [],
        },
      },
    ]);
  });

  it('starts a store that subscribes late from the state as it is', () => {
    const source = new FakeDeckSource();
    source.state({ rooms: { bridge: 'powered' } });
    const store = new DeckStateStore(source, []);
    store.onInit();
    expect(store.snapshot().rooms).toEqual({ bridge: 'powered' });
  });
});
