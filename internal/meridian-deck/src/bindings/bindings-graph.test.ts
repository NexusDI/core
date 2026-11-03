import { defineModule, Nexus, provide } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeckState } from '../state/deck-state.module.js';
import { DECK_BINDINGS, DECK_SOURCE, DECK_STATE } from '../state/tokens.js';
import { OPTIONS } from '../test-support.js';

import {
  CommsDeck,
  EngineeringDeck,
  FtlDeck,
  HelmDeck,
  LifeSupportDeck,
  SafetyDeck,
  SHIP_FEED,
  TelemetryDeckSource,
  WeaponsDeck,
} from './index.js';
import { FakeShipFeed, TestShip } from './test-support.js';

const DECKS = [
  EngineeringDeck,
  LifeSupportDeck,
  SafetyDeck,
  CommsDeck,
  HelmDeck,
  FtlDeck,
  WeaponsDeck,
];

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0)) await close();
});

/** The app: a global module binds the feed and the telemetry source, and the root imports the deck state and the seven bindings. */
async function app() {
  const feed = new FakeShipFeed();
  const Wiring = defineModule({
    name: 'ShipWiring',
    global: true,
    providers: [
      provide(SHIP_FEED, { useValue: feed }),
      provide(DECK_SOURCE, { useClass: TelemetryDeckSource }),
    ],
    exports: [SHIP_FEED, DECK_SOURCE],
  });
  const nexus = await Nexus.create(
    defineModule({
      name: 'Root',
      imports: [Wiring, DeckState.forRoot(OPTIONS), ...DECKS],
    }),
  );
  cleanup.push(() => nexus[Symbol.asyncDispose]());
  const ship = await TestShip.start({ ftl: true });
  cleanup.push(() => ship.dispose());
  return { nexus, feed, ship };
}

describe('the seven bindings in one graph', () => {
  it('contributes seven classes to DECK_BINDINGS', async () => {
    const { nexus } = await app();
    expect(nexus.get(DECK_BINDINGS)).toHaveLength(7);
  });

  it('lights the deck from one real frame without a double-set warning', async () => {
    const { nexus, feed, ship } = await app();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = nexus.get(DECK_STATE);
    feed.push({ type: 'reading', reading: ship.powerUp() });
    const snapshot = state.snapshot();
    expect(warn).not.toHaveBeenCalled();
    expect(snapshot.rooms['bridge']).toBe('powered');
    expect(snapshot.rooms['engineering']).toBe('powered');
    expect(snapshot.rooms['shuttle-bay']).toBe('unpowered');
    expect(snapshot.frames['ftl-core.ring']).toBe('on');
    expect(snapshot.fixtures['ftl-core.ring']).toBe('standby');
    expect(snapshot.frames['bridge.helm']).toBe('on');
    expect(snapshot.doors['airlock-outer']).toEqual({ state: 'closed' });
    expect(snapshot.alarms).toEqual([]);
  });

  it('raises no double-set warning when an alarm, a shed load and a fire arrive together', async () => {
    const { nexus, feed, ship } = await app();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reading = ship.powerUp();
    feed.push({
      type: 'reading',
      reading: {
        ...reading,
        power: { ...reading.power, shed: ['shields'] },
        safety: {
          ...reading.safety,
          fires: { ...reading.safety.fires, 'ftl-core': 0.5, engineering: 0.2 },
          alarms: [
            { code: 'FIRE', subject: 'engineering', acknowledged: false },
            { code: 'FIRE', subject: 'ftl-core', acknowledged: false },
            { code: 'DECOMPRESSION', subject: 'airlock', acknowledged: false },
            { code: 'LOAD_SHED', subject: 'shields', acknowledged: false },
          ],
        },
      },
    });
    const snapshot = nexus.get(DECK_STATE).snapshot();
    expect(warn).not.toHaveBeenCalled();
    expect(snapshot.rooms['engineering']).toBe('alarm');
    expect(snapshot.frames['ftl-core.ring']).toBe('damaged');
    expect(snapshot.conduits['power.shields.dorsal']?.state).toBe('shed');
    expect(snapshot.doors['habitat-airlock']?.cause).toBe('DECOMPRESSION');
  });

  it('darkens the deck when the feed reports the backend unreachable', async () => {
    const { nexus, feed, ship } = await app();
    const state = nexus.get(DECK_STATE);
    feed.push({ type: 'reading', reading: ship.powerUp() });
    feed.push({ type: 'unreachable' });
    expect(state.snapshot().rooms['bridge']).toBe('unpowered');
  });

  it('hands a deck state built after a reading the latest frame at once', async () => {
    const { nexus, feed, ship } = await app();
    feed.push({ type: 'reading', reading: ship.powerUp() });
    const late = new TelemetryDeckSource(feed);
    const heard: string[] = [];
    late.subscribe((event) => heard.push(event.type));
    expect(heard).toEqual(['reading']);
    expect(nexus.get(DECK_STATE).snapshot().rooms['bridge']).toBe('powered');
  });
});
