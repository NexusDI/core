/**
 * The events the trigger engine reads that no source in this package sends.
 * A source that has the facts sends them; the engine reads the shapes below.
 */
import type { RefusalCode, ShipReading } from '@nexusdi/meridian-systems';

declare module '../state/contracts.js' {
  interface DeckEventMap {
    /** A telemetry frame. A `record` condition reads a dotted path of it. */
    reading: { readonly reading: ShipReading };
    /** A command answer. `refused` carries the refusal code and the narrowing fields name what it refused. */
    answer: {
      readonly refused?: RefusalCode;
      readonly door?: string;
      readonly room?: string;
      readonly system?: string;
    };
    /** The reader selected a room, door or fixture. */
    select: { readonly id: string };
    /** The graph now: the loaded modules, and the trace events seen at each provider's fixture. */
    graph: {
      readonly modules: readonly string[];
      readonly providers: Readonly<Record<string, readonly string[]>>;
    };
    /** An Academy objective reported. */
    objective: {
      readonly objective: string;
      readonly status: 'pass' | 'fail';
    };
    /** The missions the progress stores hold a pass of. */
    passed: { readonly missions: readonly string[] };
  }
}

import type { DeckEvent } from '../state/contracts.js';

/** The events of this entry, which the engine reads and a source may send. */
export type MapEvent = Extract<
  DeckEvent,
  { type: 'reading' | 'answer' | 'select' | 'graph' | 'objective' | 'passed' }
>;
