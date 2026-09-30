import type { Lifetime } from '../definitions/types.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { fromUserCode } from './format.js';
import type { OwnedEntry } from './ownership.js';

/**
 * Each trace event type's fields (spec section 10.2). A package adds its own
 * by augmentation, keyed `<package>/<event>`.
 */
export interface TraceEventByType {
  compile: {
    phase: 'create' | 'load' | 'check';
    modules: number;
    providers: number;
    errors: number;
    durationMs: number;
  };
  construct: {
    token: string;
    providerId: string;
    module: string;
    /** null for value and alias providers. */
    lifetime: Lifetime | null;
    scope: string | null;
    async: boolean;
    durationMs: number;
  };
  untracked: {
    token: string;
    providerId: string;
    reason: 'root-transient' | 'singleton-thunk';
  };
  init: { token: string; providerId: string; durationMs: number };
  'scope:create': { scope: string; built: number; durationMs: number };
  'scope:extend': {
    scope: string;
    modules: string[];
    built: number;
    durationMs: number;
  };
  'scope:dispose': {
    scope: string;
    disposed: number;
    errors: number;
    durationMs: number;
  };
  /** One per instance the container or a scope disposes, in disposal order. */
  'dispose:instance': {
    token: string;
    providerId: string;
    scope: string | null;
  };
  dispose: { disposed: number; errors: number; durationMs: number };
}

/** A typed lifecycle event. `TraceEvent` alone is the union of every type. */
export type TraceEvent<
  K extends keyof TraceEventByType = keyof TraceEventByType,
> = {
  [T in K]: { readonly type: T } & TraceEventByType[T];
}[K];

/** One consumer of trace events: a plugin's observe hook. */
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

  constructor(sinks: readonly TraceSink[] = NO_SINKS) {
    this.#sinks = sinks;
  }

  now(): number {
    return HOOK_SITES && this.#sinks.length > 0 ? performance.now() : 0;
  }

  // emit stays this small so the engine inlines it into each caller, and
  // with no sink the `make` closure a caller passes is never allocated.
  emit(make: () => TraceEvent): void {
    if (HOOK_SITES && this.#sinks.length > 0) send(this.#sinks, make());
  }
}

function send(sinks: readonly TraceSink[], event: TraceEvent): void {
  for (const sink of sinks) {
    try {
      sink(event);
    } catch (error) {
      throw fromUserCode(error);
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
