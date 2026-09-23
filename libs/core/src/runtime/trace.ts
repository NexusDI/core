import type { Lifetime } from '../definitions/types.js';

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

/**
 * Hands events to the `trace` callback. Without a callback, `emit` runs one
 * `if` and builds nothing, and `now` reads no clock. An exception the callback
 * throws propagates to the caller of the operation that emitted the event.
 */
export class Tracer {
  readonly #sink: ((event: TraceEvent) => void) | undefined;

  constructor(sink?: (event: TraceEvent) => void) {
    this.#sink = sink;
  }

  now(): number {
    return this.#sink === undefined ? 0 : performance.now();
  }

  emit(make: () => TraceEvent): void {
    if (this.#sink !== undefined) this.#sink(make());
  }
}
