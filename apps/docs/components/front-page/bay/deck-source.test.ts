import type { DeckEvent } from '@nexusdi/meridian-deck';
import { describe, expect, it } from 'vitest';

import { PreflightDeckSource } from './deck-source';
import { darkPower, powerAfter } from './power';
import { readFixtures } from './fixtures';
import { shipView } from './ship-view';
import { SEED_STATE } from './state';

const view = (power = darkPower(SEED_STATE)) =>
  shipView({
    state: SEED_STATE,
    power,
    check: { ok: true, error: null },
    startupError: null,
    lookupError: null,
    online: [],
    linked: null,
  });

const FIXTURES = [
  'reactor-bay.core-glow',
  'computer-core.rack-port',
  'main-drive.control-panel',
  'bridge.forward-console',
];

describe('the deck source of the bay', () => {
  it('hands a late listener the current state as its first event, with no ramp', () => {
    const source = new PreflightDeckSource(FIXTURES);
    source.update(view().light);
    const events: DeckEvent[] = [];
    source.subscribe((event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0]?.patch.ramp).toEqual({ delay: 0, duration: 0 });
    expect(events[0]?.patch.rooms?.['bridge']).toBe('unpowered');
  });

  it('sends only the keys that changed, and nothing when nothing did', () => {
    const source = new PreflightDeckSource(FIXTURES);
    const events: DeckEvent[] = [];
    source.subscribe((event) => events.push(event));
    source.update(view().light);
    const seed = readFixtures().find((each) => each.id === 'seed');
    const trace = seed?.launch?.trace ?? [];
    const lit = view(powerAfter(SEED_STATE, trace)).light;
    source.update(lit);
    const patch = events.at(-1)?.patch;
    expect(Object.keys(patch?.rooms ?? {}).sort()).toEqual([
      'bridge',
      'chart-room',
      'comms-relay',
      'computer-core',
      'engineering',
      'reactor-bay',
    ]);
    expect(patch?.rooms?.['bridge']).toBe('powered');
    const count = events.length;
    source.update(lit);
    expect(events).toHaveLength(count);
  });

  it('drives a provider fixture from its system and keeps any other screen lit', () => {
    const source = new PreflightDeckSource(FIXTURES);
    const events: DeckEvent[] = [];
    source.subscribe((event) => events.push(event));
    const seed = readFixtures().find((each) => each.id === 'seed');
    source.update(
      view(powerAfter(SEED_STATE, seed?.launch?.trace ?? [])).light,
    );
    const fixtures = events.at(-1)?.patch.fixtures ?? {};
    expect(fixtures['reactor-bay.core-glow']).toBe('online');
    expect(fixtures['computer-core.rack-port']).toBe('online');
    // The control panel belongs to the main drive, which no module lights, and
    // an unpowered room keeps its emissive screens.
    expect(fixtures['main-drive.control-panel']).toBe('online');
  });

  it('shows an alarm room as alarm and keeps its glow on', () => {
    const light = view().light;
    const alarm = {
      ...light,
      rooms: { ...light.rooms, 'chart-room': 'alarm' as const },
    };
    const source = new PreflightDeckSource(FIXTURES);
    const events: DeckEvent[] = [];
    source.subscribe((event) => events.push(event));
    source.update(alarm);
    expect(events.at(-1)?.patch.rooms?.['chart-room']).toBe('alarm');
  });

  it('stops sending after a listener unsubscribes', () => {
    const source = new PreflightDeckSource(FIXTURES);
    const events: DeckEvent[] = [];
    const stop = source.subscribe((event) => events.push(event));
    stop();
    source.update(view().light);
    expect(events).toEqual([]);
  });
});
