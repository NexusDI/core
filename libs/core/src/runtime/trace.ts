import type { Lifetime } from '../definitions/types.js';
import { fromUserCode } from './format.js';
import type { OwnedEntry } from './ownership.js';

/** A typed lifecycle event (spec section 10.2). */
export type TraceEvent =
  | {
      type: 'compile';
      phase: 'create' | 'load';
      modules: number;
      providers: number;
      errors: number;
      durationMs: number;
    }
  | {
      type: 'construct';
      token: string;
      providerId: string;
      module: string;
      /** null for value and alias providers. */
      lifetime: Lifetime | null;
      scope: string | null;
      async: boolean;
      durationMs: number;
    }
  | {
      type: 'untracked';
      token: string;
      providerId: string;
      reason: 'root-transient' | 'singleton-thunk';
    }
  | { type: 'init'; token: string; providerId: string; durationMs: number }
  | { type: 'scope:create'; scope: string; built: number; durationMs: number }
  | {
      type: 'scope:dispose';
      scope: string;
      disposed: number;
      errors: number;
      durationMs: number;
    }
  /** One per instance the container or a scope disposes, in disposal order. */
  | {
      type: 'dispose:instance';
      token: string;
      providerId: string;
      scope: string | null;
    }
  | { type: 'dispose'; disposed: number; errors: number; durationMs: number };

/** One consumer of trace events: the `trace` option or a plugin's observe hook. */
export type TraceSink = (event: TraceEvent) => void;

const NO_SINKS: readonly TraceSink[] = Object.freeze([]);

/**
 * Hands events to every sink, in order. With none, `emit` runs one length
 * test and builds nothing, and `now` reads no clock. An exception a sink
 * throws propagates to the caller of the operation that emitted the event,
 * and the sinks after it do not see that event.
 */
export class Tracer {
  readonly #sinks: readonly TraceSink[];

  constructor(sinks: TraceSink | readonly TraceSink[] = NO_SINKS) {
    this.#sinks = typeof sinks === 'function' ? [sinks] : sinks;
  }

  now(): number {
    return this.#sinks.length === 0 ? 0 : performance.now();
  }

  emit(make: () => TraceEvent): void {
    if (this.#sinks.length === 0) return;
    const event = make();
    for (const sink of this.#sinks) {
      try {
        sink(event);
      } catch (error) {
        throw fromUserCode(error);
      }
    }
  }
}

/** The callback disposeInReverse calls per disposed instance: one dispose:instance event each. */
export function reportDisposal(
  tracer: Tracer,
  scope: string | null,
): (entry: OwnedEntry) => void {
  return (entry) =>
    tracer.emit(() => ({
      type: 'dispose:instance',
      token: entry.token,
      providerId: entry.providerId,
      scope,
    }));
}
