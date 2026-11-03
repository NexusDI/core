import { describe, expect, it } from 'vitest';

import type { DeckEvent } from '../state/contracts.js';

import type { IShipFeed, ShipFeedEvent } from './contracts.js';
import { TelemetryDeckSource } from './telemetry-deck-source.js';
import { FakeShipFeed } from './test-support.js';

function heard(feed: IShipFeed): { events: DeckEvent[]; stop: () => void } {
  const events: DeckEvent[] = [];
  const stop = new TelemetryDeckSource(feed).subscribe((event) =>
    events.push(event),
  );
  return { events, stop };
}

describe('TelemetryDeckSource', () => {
  it('turns a reading into a reading event', () => {
    const feed = new FakeShipFeed();
    const { events } = heard(feed);
    const reading = {} as never;
    feed.push({ type: 'reading', reading });
    expect(events).toEqual([{ type: 'reading', reading }]);
  });

  it('turns an accepted and a refused answer into answer events', () => {
    const feed = new FakeShipFeed();
    const { events } = heard(feed);
    feed.push({ type: 'answer', system: 'safety' });
    feed.push({
      type: 'answer',
      refused: 'MERIDIAN_INTERLOCK',
      door: 'airlock-outer',
      room: 'airlock',
    });
    expect(events).toEqual([
      { type: 'answer', system: 'safety' },
      {
        type: 'answer',
        refused: 'MERIDIAN_INTERLOCK',
        door: 'airlock-outer',
        room: 'airlock',
      },
    ]);
  });

  it('turns a graph view into a graph event', () => {
    const feed = new FakeShipFeed();
    const { events } = heard(feed);
    feed.push({
      type: 'graph',
      modules: ['Root'],
      providers: { REACTOR: ['construct'] },
    });
    expect(events).toEqual([
      {
        type: 'graph',
        modules: ['Root'],
        providers: { REACTOR: ['construct'] },
      },
    ]);
  });

  it('turns an unreachable backend into a patch that darkens every room and clears the alarms', () => {
    const feed = new FakeShipFeed();
    const { events } = heard(feed);
    feed.push({ type: 'unreachable' });
    const [event] = events;
    expect(event?.type).toBe('state');
    if (event?.type !== 'state') return;
    expect(Object.keys(event.patch.rooms ?? {})).toHaveLength(14);
    expect(new Set(Object.values(event.patch.rooms ?? {}))).toEqual(
      new Set(['unpowered']),
    );
    expect(event.patch.alarms).toEqual([]);
  });

  it('hands a late subscriber the latest reading at once, through the feed', () => {
    const feed = new FakeShipFeed();
    const first = {} as never;
    const latest = { tick: 2 } as never;
    feed.push({ type: 'reading', reading: first });
    feed.push({ type: 'reading', reading: latest });
    const { events } = heard(feed);
    expect(events).toEqual([{ type: 'reading', reading: latest }]);
  });

  it('stops hearing the feed after the unsubscribe', () => {
    const feed = new FakeShipFeed();
    const { events, stop } = heard(feed);
    stop();
    feed.push({ type: 'unreachable' } satisfies ShipFeedEvent);
    expect(events).toEqual([]);
    expect(feed.listeners.size).toBe(0);
  });
});
