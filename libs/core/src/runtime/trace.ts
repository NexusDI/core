import type { Lifetime } from '../definitions/types.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { fromUserCode } from './format.js';
import type { OwnedEntry } from './ownership.js';

/** The operation a run is. May gain a member in a minor release; handle an unknown kind. */
export type RunKind = 'create' | 'load' | 'createScope' | 'extend';

/**
 * The fields of every build event: construct, construct:await and
 * construct:failed for a constructor or factory, and init, init:await and
 * init:failed for an onInit call. One literal in core builds all six. Each
 * field reads up to the moment its event fires, so on an :await event
 * awaitMs and finishMs are 0 or close to it. On the init events lifetime
 * is 'singleton', scope is null and finishMs is 0.
 */
interface BuildEventFields {
  token: string;
  providerId: string;
  module: string;
  /** null for value and alias providers. */
  lifetime: Lifetime | null;
  scope: string | null;
  /** Whether the call returned a thenable. */
  async: boolean;
  run: number | null;
  level: number | null;
  parent: string | null;
  startMs: number;
  /** From the call until it returned or threw, nested builds included. */
  syncMs: number;
  /** From that return until the thenable settled or the build failed; null when the call returned no thenable. */
  awaitMs: number | null;
  /** From the build resuming until the instance was stored or the build failed: options validation and construct hooks. */
  finishMs: number;
  /** Wall time from the call to the event, time queued behind the level's other providers included. */
  durationMs: number;
}

/**
 * Each trace event type's fields. A package adds its own
 * by augmentation, keyed `<package>/<event>`.
 *
 * Core may add event types and fields in any minor release. An observer
 * ignores what it does not know. These rules hold across a release line.
 * Every core event with `durationMs` also has `startMs`, both in
 * milliseconds of `performance.now()` in the realm that emitted it. The
 * event's span is `[startMs, startMs + durationMs]` in wall time, and core
 * hands the event to observers synchronously when that span ends. A package
 * that adds a timed event of its own should give it `startMs` with the same
 * meaning. Run ids are unique within one container, and `create` is run 0.
 * A run that settles ends with exactly one `run` event, after every other
 * event of that run. Level numbers, and which work `finishMs` covers beyond
 * options validation and construct hooks, describe how core works today and
 * may change in a minor release.
 *
 * @remarks
 * Stable in plugin API 1: the event types and fields listed on /trace-events/.
 * Evolving: level numbering, and which work `finishMs` covers beyond options
 * validation and construct hooks. Both may change in a minor release.
 */
export interface TraceEventByType {
  compile: {
    phase: 'create' | 'load' | 'check';
    modules: number;
    providers: number;
    errors: number;
    /** The run this compile starts; null for check(). */
    run: number | null;
    startMs: number;
    durationMs: number;
  };
  /** A build stored its instance. */
  construct: BuildEventFields;
  /** A factory returned a thenable; core now awaits it. The build ends with construct or construct:failed. */
  'construct:await': BuildEventFields;
  /** A build failed between the constructor or factory call and the store. */
  'construct:failed': BuildEventFields;
  untracked: {
    token: string;
    providerId: string;
    reason: 'root-transient' | 'singleton-thunk';
  };
  /**
   * A lazy() or lazy(all()) thunk returned. One per call, and one per
   * contribution for lazy(all()). A read that builds its target emits that
   * build's construct first. A call that throws emits none.
   */
  'lazy:read': {
    /** The display name of the record the thunk reads: the alias or the contribution itself, before any alias hop. */
    token: string;
    /** The id the thunk reads: the `to` of its lazy edge in the blueprint. */
    providerId: string;
    /** The provider whose deps hold the thunk, or null for a thunk from resolve(). */
    owner: string | null;
    /** The scope the thunk was made in, or null at the root. */
    scope: string | null;
    /** True when this read built its target: a transient, a deferred singleton, or a scoped instance built on demand. */
    built: boolean;
    /** Always null: a thunk read belongs to no run. A later minor release may widen it to number | null. */
    run: null;
  };
  /** A singleton's onInit settled. */
  init: BuildEventFields;
  /** onInit returned a thenable; core now awaits it. Ends with init or init:failed. */
  'init:await': BuildEventFields;
  /** onInit threw or rejected, or an on-demand build refused its thenable (NEXUS_LAZY_ASYNC). */
  'init:failed': BuildEventFields;
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
 * so the operation's own error reaches the caller. A failure with no list
 * to hold the throw passes a fresh one. With no list, as on a success
 * path, the throw propagates as tracer.emit's does.
 */
export function emitCollecting(
  tracer: Tracer,
  errors: unknown[] | undefined,
  make: () => TraceEvent,
): void {
  try {
    tracer.emit(make);
  } catch (error) {
    if (!errors) throw error;
    errors.push(error);
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
  errors?: unknown[];
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
  emitCollecting(tracer, errors, make);
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
