import { callAll } from '../simulation/call-all';
import {
  DECK_PLAN,
  type DeckPlan,
  type IShipState,
  type ITickLoop,
  SHIP_STATE,
  type ShipReading,
  type ShipSnapshot,
  TICK_LOOP,
} from '../simulation/contracts';
import { readShip } from '../simulation/read-ship';
import type { ITelemetryFeed, TelemetrySink } from './contracts';

const OFFLINE = 'ship offline';

/** One subscription, so a sink subscribed twice hears twice. */
interface Entry {
  readonly sink: TelemetrySink;
}

/**
 * Hands each sink the reading of every tick: the rounded snapshot with each
 * compartment's pressure. It owns no timer and no I/O, so the ship advances
 * it and `bridge-api` frames and sends it. The feed listens to the loop in
 * `onInit`, so a container built with `onInit: false` gives a feed that
 * never hears a tick.
 */
export class SnapshotFeed implements ITelemetryFeed, Disposable {
  static deps = [TICK_LOOP, SHIP_STATE, DECK_PLAN] as const;

  private readonly entries = new Set<Entry>();
  private stopListening: (() => void) | undefined;
  private offline = false;

  constructor(
    private readonly loop: ITickLoop,
    private readonly state: IShipState,
    private readonly deck: DeckPlan,
  ) {}

  onInit(): void {
    this.stopListening = this.loop.listen((ship) => this.send(ship));
  }

  subscribe(sink: TelemetrySink): () => void {
    if (this.offline) {
      sink.close(OFFLINE);
      return () => {};
    }
    sink.next(readShip(this.state.snapshot(), this.deck));
    const entry: Entry = { sink };
    this.entries.add(entry);
    return () => {
      this.entries.delete(entry);
    };
  }

  [Symbol.dispose](): void {
    this.stopListening?.();
    this.offline = true;
    const open = [...this.entries];
    this.entries.clear();
    callAll(
      open.map(({ sink }) => sink.close.bind(sink)),
      OFFLINE,
    );
  }

  /** Reads the snapshot once, and only while a sink is open. */
  private send(ship: ShipSnapshot): void {
    if (this.entries.size === 0) return;
    callAll(this.openSinks(), readShip(ship, this.deck));
  }

  /**
   * Walks the sinks open when dispatch began and skips one unsubscribed
   * since, as the loop does with its listeners.
   */
  private *openSinks(): Generator<(frame: ShipReading) => void> {
    for (const entry of [...this.entries]) {
      if (this.entries.has(entry)) yield (frame) => entry.sink.next(frame);
    }
  }
}
