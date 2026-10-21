import { callAll } from '../simulation/call-all';
import {
  type IShipState,
  type ITickLoop,
  SHIP_STATE,
  type ShipSnapshot,
  TICK_LOOP,
} from '../simulation/contracts';
import { roundSnapshot } from '../simulation/round-snapshot';
import type { ITelemetryFeed, TelemetrySink } from './contracts';

const OFFLINE = 'ship offline';

/** One subscription, so a sink subscribed twice hears twice. */
interface Entry {
  readonly sink: TelemetrySink;
}

/**
 * Hands each sink the rounded snapshot of every tick. It owns no timer and
 * no I/O, so the ship advances it and `bridge-api` frames and sends it. The
 * feed listens to the loop in `onInit`, so a container built with
 * `onInit: false` gives a feed that never hears a tick.
 */
export class SnapshotFeed implements ITelemetryFeed, Disposable {
  static deps = [TICK_LOOP, SHIP_STATE] as const;

  private readonly entries = new Set<Entry>();
  private stopListening: (() => void) | undefined;
  private offline = false;

  constructor(
    private readonly loop: ITickLoop,
    private readonly state: IShipState,
  ) {}

  onInit(): void {
    this.stopListening = this.loop.listen((ship) => this.send(ship));
  }

  subscribe(sink: TelemetrySink): () => void {
    if (this.offline) {
      sink.close(OFFLINE);
      return () => {};
    }
    sink.next(roundSnapshot(this.state.snapshot()));
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
      open.map(
        ({ sink }) =>
          (reason: string) =>
            sink.close(reason),
      ),
      OFFLINE,
    );
  }

  /** Rounds the snapshot once, and only while a sink is open. */
  private send(ship: ShipSnapshot): void {
    if (this.entries.size === 0) return;
    callAll(
      [...this.entries].map(
        ({ sink }) =>
          (frame: ShipSnapshot) =>
            sink.next(frame),
      ),
      roundSnapshot(ship),
    );
  }
}
