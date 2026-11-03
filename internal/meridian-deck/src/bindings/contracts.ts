import type { ShipReading } from '@nexusdi/meridian-systems';

import type {} from '../maps/events.js';
import type {
  DeckEvent,
  DeckEventMap,
  ReadoutDefinition,
} from '../state/contracts.js';

/**
 * What the app's client hears from the ship, by type. A backend that cannot
 * be reached is an event of its own, so the deck can show the ship as unread.
 */
export type ShipFeedEvent =
  | ({ readonly type: 'reading' } & DeckEventMap['reading'])
  | ({ readonly type: 'answer' } & DeckEventMap['answer'])
  | ({ readonly type: 'graph' } & DeckEventMap['graph'])
  | { readonly type: 'unreachable' };

/**
 * The app's adapter over its own client. A subscriber hears the latest
 * reading, or `unreachable` when the link dropped after it, and the latest
 * graph, then each later event.
 */
export interface IShipFeed {
  subscribe(listener: (event: ShipFeedEvent) => void): () => void;
}

/** One value a readout shows. */
export type ReadoutValue = string | number | boolean | null;

type EventOf<Type extends DeckEvent['type']> = Extract<
  DeckEvent,
  { type: Type }
>;

/** A readout whose value is a function of the latest frame. */
export interface FrameReadout extends ReadoutDefinition {
  readonly source: 'reading';
  /** The value in `unit`, or null when the frame holds no record for it. */
  read(reading: ShipReading): ReadoutValue;
}

/** A readout whose value comes from the latest command answer. */
export interface AnswerReadout extends ReadoutDefinition {
  readonly source: 'answer';
  read(answer: EventOf<'answer'>): ReadoutValue;
}

/** A readout whose value comes from the latest graph event. */
export interface GraphReadout extends ReadoutDefinition {
  readonly source: 'graph';
  read(graph: EventOf<'graph'>): ReadoutValue;
}

/**
 * A readout a map's callout may name. The DOM layer picks the event or the
 * frame by `source` and calls `read`.
 */
export type Readout = FrameReadout | AnswerReadout | GraphReadout;
