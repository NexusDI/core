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
} from '../state/index.js';

/**
 * A source a test pushes events through. A new listener hears the state so
 * far at once, as one `state` event, as every source does.
 */
export class FakeDeckSource implements IDeckSource {
  private readonly listeners = new Set<(event: DeckEvent) => void>();
  private rooms: Record<string, RoomLight> = {};
  private fixtures: Record<string, FixtureLight> = {};
  private frames: Record<string, PropFrame> = {};
  private doors: Record<string, DoorState> = {};
  private conduits: Record<string, ConduitState> = {};
  private alarms: readonly DeckAlarm[] | undefined;
  private seen = false;

  subscribe(listener: (event: DeckEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.seen) listener({ type: 'state', patch: this.current() });
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Sends an event to every listener. A `state` event also joins the state a late listener hears. */
  push(event: DeckEvent): void {
    if (event.type === 'state') this.remember(event.patch);
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Shorthand for `push({ type: 'state', patch })`. */
  state(patch: DeckPatch): void {
    this.push({ type: 'state', patch });
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
