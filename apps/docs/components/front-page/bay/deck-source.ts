import type {
  DeckEvent,
  DeckPatch,
  FixtureLight,
  IDeckSource,
  RoomLight,
} from '@nexusdi/meridian-deck';

import type { LightTable } from './ship-view';

/**
 * Feeds the deck view from the bay (owner ruling OR5). It reads the one
 * derived table `ShipView.light`, the same table that the Schematic's tint
 * layer reads, and turns each change into a `state` event with only the keys
 * that changed. A listener gets the current state as its first event, so a
 * view that attaches late starts from the ship as it is. The deck runs in its
 * own container: this class is bound there and never enters the seed's graph.
 */
export class PreflightDeckSource implements IDeckSource {
  private readonly listeners = new Set<(event: DeckEvent) => void>();
  private rooms: Readonly<Record<string, RoomLight>> = {};
  private fixtures: Readonly<Record<string, FixtureLight>> = {};
  private known = false;

  /** `fixtureIds` are the fixtures that the cutaway's lights name. */
  constructor(private readonly fixtureIds: readonly string[]) {}

  subscribe(listener: (event: DeckEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.known) {
      listener({
        type: 'state',
        patch: {
          rooms: this.rooms,
          fixtures: this.fixtures,
          ramp: { delay: 0, duration: 0 },
        },
      });
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Sets the state of the ship. A key that did not change sends nothing. */
  update(light: LightTable, ramp?: DeckPatch['ramp']): void {
    const rooms: Record<string, RoomLight> = { ...light.rooms };
    const fixtures: Record<string, FixtureLight> = {};
    // A fixture that no system drives is a screen or a lamp of its own. It
    // stays lit when its room is dark, since an unpowered room is dark but
    // for its emissive screens (owner ruling OR5).
    for (const id of this.fixtureIds) fixtures[id] = light.glow[id] ?? 'online';
    const changedRooms = changed(this.rooms, rooms);
    const changedFixtures = changed(this.fixtures, fixtures);
    const first = !this.known;
    this.rooms = rooms;
    this.fixtures = fixtures;
    this.known = true;
    if (!changedRooms && !changedFixtures) return;
    const patch: DeckPatch = {
      ...(changedRooms ? { rooms: changedRooms } : {}),
      ...(changedFixtures ? { fixtures: changedFixtures } : {}),
      ...(first ? { ramp: { delay: 0, duration: 0 } } : ramp ? { ramp } : {}),
    };
    for (const listener of [...this.listeners])
      listener({ type: 'state', patch });
  }
}

/** The entries of `next` that differ from `before`, or null when none does. */
function changed<V extends string>(
  before: Readonly<Record<string, V>>,
  next: Readonly<Record<string, V>>,
): Record<string, V> | null {
  const out: Record<string, V> = {};
  let any = false;
  for (const [key, value] of Object.entries(next)) {
    if (before[key] !== value) {
      out[key] = value;
      any = true;
    }
  }
  return any ? out : null;
}
