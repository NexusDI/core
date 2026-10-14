import type { Lifetime } from '../definitions/types.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { fromUserCode } from './format.js';
import type { OwnedEntry } from './ownership.js';

/** The operation a run is. May gain a member in a minor release; handle an unknown kind. */
export type RunKind = 'create' | 'load' | 'createScope' | 'extend';

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
    /** The run this compile starts; null for Nexus.check. */
    run: number | null;
    startMs: number;
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
    startMs: number;
    durationMs: number;
  };
  untracked: {
    token: string;
    providerId: string;
    reason: 'root-transient' | 'singleton-thunk';
  };
  init: {
    token: string;
    providerId: string;
    startMs: number;
    durationMs: number;
  };
  run: {
    run: number;
    kind: RunKind;
    /** The scope for createScope and extend(); null at the root. */
    scope: string | null;
    ok: boolean;
    startMs: number;
    durationMs: number;
  };
  'scope:create': {
    scope: string;
    built: number;
    run: number;
    startMs: number;
    durationMs: number;
  };
  'scope:extend': {
    scope: string;
    modules: string[];
    built: number;
    run: number;
    startMs: number;
    durationMs: number;
  };
  'scope:dispose': {
    scope: string;
    disposed: number;
    errors: number;
    startMs: number;
    durationMs: number;
  };
  /** One per instance the container or a scope disposes, in disposal order. */
  'dispose:instance': {
    token: string;
    providerId: string;
    scope: string | null;
  };
  dispose: {
    disposed: number;
    errors: number;
    startMs: number;
    durationMs: number;
  };
}

/** A trace event. `TraceEvent` alone is the union of every type. */
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

/**
 * Emits on a failure path (spec 3.5): an observer's throw joins `errors`,
 * or is dropped when the failure has no list to hold it, so the
 * operation's own error reaches the caller.
 */
export function emitCollecting(
  tracer: Tracer,
  errors: unknown[] | undefined,
  make: () => TraceEvent,
): void {
  try {
    tracer.emit(make);
  } catch (error) {
    errors?.push(error);
  }
}

/**
 * One create, load, createScope or extend(), as its closing `run` event
 * reports it. `errors` collects the observer throws of the run's failure
 * path (spec 3.5).
 */
export interface RunTrace {
  readonly id: number;
  readonly kind: RunKind;
  /** null at the root, and for a createScope until its scope exists. */
  scope: string | null;
  /** When the run began, on the tracer's clock. */
  readonly start: number;
  errors: unknown[] | undefined;
}

/**
 * The `run` event that ends a create, load, createScope or extend(). With
 * `errors` the run failed, and an observer's throw joins that list; a
 * failure with no list to hold it passes `[]`, which drops the throw.
 */
export function emitRun(
  tracer: Tracer,
  run: RunTrace,
  errors?: unknown[],
): void {
  const make = (): TraceEvent => ({
    type: 'run',
    run: run.id,
    kind: run.kind,
    scope: run.scope,
    ok: !errors,
    startMs: run.start,
    durationMs: tracer.now() - run.start,
  });
  if (errors) emitCollecting(tracer, errors, make);
  else tracer.emit(make);
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
