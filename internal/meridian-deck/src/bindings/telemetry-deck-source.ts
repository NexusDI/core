import { SHIP_GEOMETRY } from '@nexusdi/meridian-systems/geometry';

import type {} from '../maps/events.js';
import type { DeckEvent, IDeckSource } from '../state/contracts.js';

import type { IShipFeed, ShipFeedEvent } from './contracts.js';
import { SHIP_FEED } from './tokens.js';

/** The deck event a feed event becomes. */
function deckEventOf(event: ShipFeedEvent): DeckEvent {
  switch (event.type) {
    case 'reading':
      return { type: 'reading', reading: event.reading };
    case 'answer':
      return {
        type: 'answer',
        ...(event.refused === undefined ? {} : { refused: event.refused }),
        ...(event.door === undefined ? {} : { door: event.door }),
        ...(event.room === undefined ? {} : { room: event.room }),
        ...(event.system === undefined ? {} : { system: event.system }),
      };
    case 'graph':
      return {
        type: 'graph',
        modules: event.modules,
        providers: event.providers,
      };
    case 'unreachable':
      // Every room goes dark but for its emissive parts, and the alarms
      // clear, since a ship that cannot be read raises none.
      return {
        type: 'state',
        patch: {
          rooms: Object.fromEntries(
            SHIP_GEOMETRY.compartments.map(({ id }) => [id, 'unpowered']),
          ),
          alarms: [],
        },
      };
  }
}

/**
 * Turns the ship feed into deck events: a reading becomes `reading`, a
 * command answer becomes `answer`, a graph view becomes `graph`, and an
 * unreachable backend becomes a `state` patch that darkens every room. The
 * feed hands a late subscriber its latest reading and graph, so this source
 * does too.
 */
export class TelemetryDeckSource implements IDeckSource {
  static deps = [SHIP_FEED] as const;

  constructor(private readonly feed: IShipFeed) {}

  subscribe(listener: (event: DeckEvent) => void): () => void {
    return this.feed.subscribe((event) => listener(deckEventOf(event)));
  }
}
