import { all } from '@nexusdi/core';

import type {
  DeckChange,
  DeckEvent,
  DeckPatch,
  DeckSnapshot,
  FixtureLight,
  IDeckBinding,
  IDeckSource,
  IDeckState,
  RoomLight,
} from './contracts.js';
import { DECK_BINDINGS, DECK_SOURCE } from './tokens.js';

/**
 * Applies the patches of the source's events and tells its listeners. It
 * draws nothing: the views read it.
 */
export class DeckStateStore implements IDeckState, Disposable {
  static deps = [DECK_SOURCE, all(DECK_BINDINGS)] as const;

  private rooms: Record<string, RoomLight> = {};
  private fixtures: Record<string, FixtureLight> = {};
  private readonly listeners = new Set<(change: DeckChange) => void>();
  private stop: (() => void) | undefined;

  constructor(
    private readonly source: IDeckSource,
    private readonly bindings: readonly IDeckBinding[],
  ) {}

  onInit(): void {
    this.stop = this.source.subscribe((event) => this.receive(event));
  }

  snapshot(): DeckSnapshot {
    return { rooms: { ...this.rooms }, fixtures: { ...this.fixtures } };
  }

  subscribe(listener: (change: DeckChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Applies a patch as an event of the source would. */
  receive(event: DeckEvent): void {
    switch (event.type) {
      case 'state':
        this.apply(event.patch);
        return;
      default:
        // An event type this build does not know (P2): a binding may know it.
        for (const binding of this.bindings) {
          const patch = binding.patchOf(event);
          if (patch !== undefined) this.apply(patch);
        }
    }
  }

  [Symbol.dispose](): void {
    this.stop?.();
    this.stop = undefined;
    this.listeners.clear();
  }

  private apply(patch: DeckPatch): void {
    this.rooms = { ...this.rooms, ...patch.rooms };
    this.fixtures = { ...this.fixtures, ...patch.fixtures };
    const change = { patch, snapshot: this.snapshot() };
    for (const listener of [...this.listeners]) listener(change);
  }
}
