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
import { Subscribers } from '../simulation/subscribers';

import type { ITelemetryFeed, TelemetrySink } from './contracts';

const OFFLINE = 'ship offline';

/**
 * Hands each sink the reading of every tick: the rounded snapshot with each
 * compartment's pressure. It owns no timer and no I/O, so the ship advances
 * it and `bridge-api` frames and sends it. The feed listens to the loop in
 * `onInit`, so a container built with `onInit: false` gives a feed that
 * never hears a tick.
 */
export class SnapshotFeed implements ITelemetryFeed, Disposable {
  static deps = [TICK_LOOP, SHIP_STATE, DECK_PLAN] as const;

  /** Each `subscribe` adds its own entry, so a sink subscribed twice hears twice. */
  private readonly sinks = new Subscribers<TelemetrySink>();
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
    return this.sinks.add(sink);
  }

  [Symbol.dispose](): void {
    this.stopListening?.();
    this.offline = true;
    const open = [...this.sinks];
    this.sinks.clear();
    callAll(
      open.map((sink) => sink.close.bind(sink)),
      OFFLINE,
    );
  }

  /**
   * Reads the snapshot once, and only while a sink is open. A sink
   * unsubscribed during the tick before its turn does not hear it.
   */
  private send(ship: ShipSnapshot): void {
    if (this.sinks.size === 0) return;
    callAll(this.nextOfEach(), readShip(ship, this.deck));
  }

  /** Yields the `next` of each sink as `callAll` reaches it, so the skip of a removed sink holds. */
  private *nextOfEach(): Generator<(frame: ShipReading) => void> {
    for (const sink of this.sinks) yield (frame) => sink.next(frame);
  }
}
