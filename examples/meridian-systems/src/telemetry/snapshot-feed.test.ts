import { describe, expect, it, vi } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import type {
  DeckPlan,
  ITickLoop,
  ShipSnapshot,
  TickListener,
} from '../simulation/contracts';
import { roundSnapshot } from '../simulation/round-snapshot';
import { ShipStateStore } from '../simulation/ship-state-store';
import type { TelemetrySink } from './contracts';
import { SnapshotFeed } from './snapshot-feed';

/** Records the listener the feed gives `listen` and counts the unsubscribes. */
class FakeLoop implements ITickLoop {
  listeners: TickListener[] = [];
  readonly unsubscribe = vi.fn();
  advance(): ShipSnapshot {
    throw new Error('The feed never advances the loop.');
  }
  listen(listener: TickListener): () => void {
    this.listeners.push(listener);
    return this.unsubscribe;
  }
  tick(ship: ShipSnapshot): void {
    for (const listener of this.listeners) listener(ship);
  }
}

class RecordingSink implements TelemetrySink {
  readonly frames: ShipSnapshot[] = [];
  readonly closed: string[] = [];
  next(frame: ShipSnapshot): void {
    this.frames.push(frame);
  }
  close(reason: string): void {
    this.closed.push(reason);
  }
}

function build() {
  const loop = new FakeLoop();
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const feed = new SnapshotFeed(loop, state);
  feed.onInit();
  return { loop, state, feed };
}

/** A snapshot at `tick` with a slow-rounding temperature. */
function at(state: ShipStateStore, tick: number): ShipSnapshot {
  const ship = state.snapshot();
  return {
    ...ship,
    tick,
    time: tick / 2,
    compartments: {
      ...ship.compartments,
      habitat: { ...ship.compartments.habitat, temperature: 293.123456 },
    },
  };
}

describe('SnapshotFeed', () => {
  it('listens to the loop once at init', () => {
    const { loop } = build();
    expect(loop.listeners).toHaveLength(1);
  });

  it('sends the current rounded snapshot at subscribe', () => {
    const { state, feed } = build();
    state.commit(at(state, 0));
    const sink = new RecordingSink();
    feed.subscribe(sink);
    expect(sink.frames).toEqual([roundSnapshot(state.snapshot())]);
    expect(sink.frames[0].compartments.habitat.temperature).toBe(293.1);
  });

  it('sends one rounded frame per tick, the same object to every sink', () => {
    const { loop, state, feed } = build();
    const a = new RecordingSink();
    const b = new RecordingSink();
    feed.subscribe(a);
    feed.subscribe(b);
    const ship = at(state, 1);
    loop.tick(ship);
    expect(a.frames[1]).toEqual(roundSnapshot(ship));
    expect(a.frames[1].compartments.habitat.temperature).toBe(293.1);
    expect(b.frames[1]).toBe(a.frames[1]);
  });

  it('rounds nothing while no sink is open', () => {
    const { loop, state } = build();
    let reads = 0;
    const ship = at(state, 1);
    loop.tick({
      ...ship,
      get tick() {
        reads++;
        return 1;
      },
    });
    expect(reads).toBe(0);
  });

  it('stops a sink at its unsubscribe, which runs twice and never closes it', () => {
    const { loop, state, feed } = build();
    const sink = new RecordingSink();
    const stop = feed.subscribe(sink);
    stop();
    stop();
    loop.tick(at(state, 1));
    expect(sink.frames).toHaveLength(1);
    expect(sink.closed).toEqual([]);
  });

  it('closes each open sink once at dispose and leaves the loop', () => {
    const { loop, feed } = build();
    const open = new RecordingSink();
    const gone = new RecordingSink();
    feed.subscribe(open);
    feed.subscribe(gone)();
    feed[Symbol.dispose]();
    expect(loop.unsubscribe).toHaveBeenCalledOnce();
    expect(open.closed).toEqual(['ship offline']);
    expect(gone.closed).toEqual([]);
  });

  it('closes a sink that subscribes after dispose at once', () => {
    const { feed } = build();
    feed[Symbol.dispose]();
    const sink = new RecordingSink();
    const stop = feed.subscribe(sink);
    expect(sink.frames).toEqual([]);
    expect(sink.closed).toEqual(['ship offline']);
    expect(() => stop()).not.toThrow();
  });

  it('skips a sink that an earlier one unsubscribed during the tick', () => {
    const { loop, state, feed } = build();
    let stopLater = () => {};
    const first = new RecordingSink();
    feed.subscribe(first);
    first.next = () => stopLater();
    const later = new RecordingSink();
    stopLater = feed.subscribe(later);
    loop.tick(at(state, 1));
    expect(later.frames).toHaveLength(1);
  });

  it('sends the frame to the other sinks when one throws', () => {
    const { loop, state, feed } = build();
    const boom = new Error('boom');
    feed.subscribe(new RecordingSink());
    const broken = new RecordingSink();
    feed.subscribe(broken);
    broken.next = () => {
      throw boom;
    };
    const after = new RecordingSink();
    feed.subscribe(after);
    expect(() => loop.tick(at(state, 1))).toThrow(boom);
    expect(after.frames).toHaveLength(2);
  });
});
