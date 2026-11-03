import type {
  ConduitState,
  DeckAlarm,
  DeckEvent,
  DeckPatch,
  DoorState,
  FixtureLight,
  IDeckSource,
  PropFrame,
  RoomLight,
} from '../state/contracts.js';

/**
 * A source that sends a fixed list of events, one `step()` at a time. A
 * listener that subscribes after some steps hears the state so far as one
 * `state` event, as every source does.
 */
export class ScriptedDeckSource implements IDeckSource {
  private readonly listeners = new Set<(event: DeckEvent) => void>();
  private next = 0;
  private rooms: Record<string, RoomLight> = {};
  private fixtures: Record<string, FixtureLight> = {};
  private frames: Record<string, PropFrame> = {};
  private doors: Record<string, DoorState> = {};
  private conduits: Record<string, ConduitState> = {};
  private alarms: readonly DeckAlarm[] | undefined;
  private seen = false;

  constructor(private readonly events: readonly DeckEvent[]) {}

  /** How many events the script has left. */
  get remaining(): number {
    return this.events.length - this.next;
  }

  subscribe(listener: (event: DeckEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.seen) listener({ type: 'state', patch: this.current() });
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Sends the next event to every listener. Returns false when the script has ended. */
  step(): boolean {
    const event = this.events[this.next];
    if (event === undefined) return false;
    this.next += 1;
    if (event.type === 'state') this.remember(event.patch);
    for (const listener of [...this.listeners]) listener(event);
    return true;
  }

  private remember(patch: DeckPatch): void {
    this.seen = true;
    Object.assign(this.rooms, patch.rooms);
    Object.assign(this.fixtures, patch.fixtures);
    Object.assign(this.frames, patch.frames);
    Object.assign(this.doors, patch.doors);
    Object.assign(this.conduits, patch.conduits);
    if (patch.alarms !== undefined) this.alarms = [...patch.alarms];
  }

  private current(): DeckPatch {
    return {
      rooms: { ...this.rooms },
      fixtures: { ...this.fixtures },
      frames: { ...this.frames },
      doors: { ...this.doors },
      conduits: { ...this.conduits },
      ...(this.alarms === undefined ? {} : { alarms: [...this.alarms] }),
    };
  }
}
