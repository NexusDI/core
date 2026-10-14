import type { Blueprint } from '../blueprint/blueprint.js';
import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { DisposedError, RequestMissingError } from '../errors/index.js';
import { buildLevels } from './build-levels.js';
import { buildInto } from './build.js';
import { resolveDeps } from './deps.js';
import { chainErrors, collectInto, disposeInReverse } from './dispose.js';
import { formatFor, guardAsync } from './format.js';
import { getFrom, hasIn } from './lookup.js';
import type { LookupOptions } from './options.js';
import { rollBack } from './settle.js';
import {
  assertOpen,
  createScopeState,
  track,
  type Owner,
  type RootState,
  type Run,
  type ScopeState,
} from './state.js';
import { emitRun, reportDisposal, type RunTrace } from './trace.js';

const ignore = (): void => undefined;

/** A child container for one unit of work, such as a request. */
export interface Scope {
  /** `s0`, `s1`, ... */
  readonly id: string;
  get<T>(token: MultiToken<T>, options?: LookupOptions): T[];
  get<T>(token: InjectionToken<T>, options?: LookupOptions): T;
  has(
    token: InjectionToken<unknown> | MultiToken<unknown>,
    options?: LookupOptions,
  ): boolean;
  /** Resolves a deps map or tuple with the rules a factory's deps follow. Synchronous, like get(). */
  resolve<const D extends DepsMap | readonly Dep[]>(
    deps: D,
    options?: LookupOptions,
  ): ResolvedDeps<D>;
  /** Re-pins the scope to the current blueprint and builds what later loads added. */
  extend(): Promise<void>;
  /** Disposes the scope's scoped and transient instances. A second call returns the first call's promise. */
  [Symbol.asyncDispose](): Promise<void>;
}

export function assertScopeOpen(scope: ScopeState): void {
  if (scope.disposal !== undefined)
    throw new DisposedError({ target: 'scope' });
  if (scope.root.disposing) throw new DisposedError({ target: 'container' });
}

/**
 * Waits for an in-flight extend(), which then aborts and disposes what it
 * built, and disposes the rest newest first. The errors of that rollback
 * come first in the rejection, since they ran first.
 */
export function disposeScope(scope: ScopeState): Promise<void> {
  scope.disposal ??= (async () => {
    await scope.extendQueue;
    const tracer = scope.root.tracer;
    const start = tracer.now();
    try {
      const report = await disposeInReverse(
        scope.owned,
        scope.root.ownership,
        reportDisposal(tracer, scope.scopeId),
      );
      // A throwing observe hook joins the scope's disposal errors instead
      // of escaping here, so the finally below still runs, and the scope's
      // own disposal errors still reach the caller chained with it.
      const errors = [...scope.abortErrors, ...report.errors];
      collectInto(errors, () =>
        tracer.emit(() => ({
          type: 'scope:dispose',
          scope: scope.scopeId,
          disposed: report.disposed,
          errors: errors.length,
          startMs: start,
          durationMs: tracer.now() - start,
        })),
      );
      const chained = chainErrors(errors);
      if (chained !== undefined) throw chained.error;
    } finally {
      // Stays in root.scopes until disposal settles, so a root disposal that
      // starts while this scope is already closing (e.g. a signal arrives
      // during an `await using` exit) finds it and awaits this same promise
      // instead of disposing root instances the scope's disposers still need.
      scope.root.scopes.delete(scope);
    }
  })();
  return scope.disposal;
}

class ScopeHandle implements Scope {
  readonly #state: ScopeState;

  constructor(state: ScopeState) {
    this.#state = state;
  }

  get id(): string {
    return this.#state.scopeId;
  }

  get<T>(token: MultiToken<T>, options?: LookupOptions): T[];
  get<T>(token: InjectionToken<T>, options?: LookupOptions): T;
  get(token: unknown, options?: LookupOptions): unknown {
    try {
      assertScopeOpen(this.#state);
      return getFrom(
        this.#state,
        this.#state.blueprint,
        token,
        options,
        this.#state,
      );
    } catch (error) {
      throw formatFor(this.#state.root, error);
    }
  }

  has(
    token: InjectionToken<unknown> | MultiToken<unknown>,
    options?: LookupOptions,
  ): boolean {
    try {
      assertScopeOpen(this.#state);
      return hasIn(this.#state, this.#state.blueprint, token, options);
    } catch (error) {
      throw formatFor(this.#state.root, error);
    }
  }

  resolve<const D extends DepsMap | readonly Dep[]>(
    deps: D,
    options?: LookupOptions,
  ): ResolvedDeps<D> {
    try {
      assertScopeOpen(this.#state);
      return resolveDeps(
        this.#state,
        this.#state.blueprint,
        deps,
        options,
        this.#state,
      ) as ResolvedDeps<D>;
    } catch (error) {
      throw formatFor(this.#state.root, error);
    }
  }

  extend(): Promise<void> {
    return guardAsync(this.#state.root, extendScope(this.#state));
  }

  [Symbol.asyncDispose](): Promise<void> {
    return guardAsync(this.#state.root, disposeScope(this.#state));
  }
}

/**
 * Builds every scoped factory and the scoped providers they depend on, level
 * by level. The runtime cannot tell a sync factory from an async one without
 * calling it, so every scoped factory runs here, once per scope. A construct
 * hook holds the scope meanwhile, so a disposal of the scope stops the next
 * level, as a root disposal does.
 */
async function buildScope(scope: ScopeState, trace: RunTrace): Promise<Scope> {
  const { root } = scope;
  const tracer = root.tracer;
  const start = tracer.now();
  let built = 0;
  try {
    built = await buildLevels(
      scope.blueprint.scopedLevels,
      () => true,
      (id, level) => buildInto(scope, scope.blueprint, id, scope, trace, level),
      () => assertScopeOpen(scope),
    );
    assertScopeOpen(scope);
  } catch (error) {
    // Read before the scope closes: a disposal a hook started waits on this
    // build, and reports the rollback's disposer errors.
    const aborted = scope.disposal !== undefined;
    // createScope never returns the scope, but a construct hook may hold its
    // handle, so the scope closes: its methods throw NEXUS_DISPOSED and its
    // [Symbol.asyncDispose]() resolves. Its slots then need no abandoning.
    scope.disposal ??= Promise.resolve();
    throw await rollBack(
      scope,
      { ...trace, touched: [], owned: scope.owned },
      scope.blueprint,
      error,
      () =>
        root.disposing
          ? root.abortErrors
          : aborted
            ? scope.abortErrors
            : undefined,
    );
  }
  root.scopes.add(scope);
  try {
    tracer.emit(() => ({
      type: 'scope:create',
      scope: scope.scopeId,
      built,
      run: trace.id,
      startMs: start,
      durationMs: tracer.now() - start,
    }));
  } catch (error) {
    // The call rejects with the observer's throw as in rc.0, and its run
    // still closes once (spec 3.4).
    emitRun(tracer, trace, []);
    throw error;
  }
  emitRun(tracer, trace);
  return scope.handle;
}

/**
 * Builds the scoped providers `target` adds to the scope's pin, level by
 * level, then moves the pin. What it builds goes to a list of its own and
 * joins the scope's creation order only when every level settled, after
 * the instances the scope already holds. A failure abandons the new slots
 * and disposes that list, newest first, and nothing the scope held before:
 * an older scoped class a new factory built on first use stays in its
 * slot, and so does a transient a get() built meanwhile.
 */
async function extendNow(
  scope: ScopeState,
  target: Blueprint,
  trace: RunTrace,
): Promise<void> {
  const { root } = scope;
  const tracer = root.tracer;
  const pinned = scope.blueprint;
  try {
    assertScopeOpen(scope);
    const dependents = target.requestDependents.filter(
      (name) => !pinned.requestDependents.includes(name),
    );
    if (dependents.length > 0 && scope.request === undefined)
      throw new RequestMissingError({ dependents });
  } catch (error) {
    // No list holds an observer's throw here (spec 3.5).
    emitRun(tracer, trace, []);
    throw error;
  }
  if (target === pinned) {
    emitRun(tracer, trace);
    return;
  }

  const start = tracer.now();
  const built: Owner = { root, owned: [] };
  const touched: string[] = [];
  let levelled = 0;
  // A provider the delta adds that a request builds on first use while
  // extend() runs joins built and touched too (scope.run).
  const run: Run = {
    ...trace,
    isNew: (pid) => !pinned.providers.has(pid),
    owner: built,
    touched,
  };
  scope.run = run;
  try {
    // The delta, and a scoped factory the pin deferred that a delta
    // factory needs, unless a request built it already. That one is a
    // provider of the pin, so the scope owns it at once, as it owns one a
    // get() builds, and a failed extend() keeps it.
    levelled = await buildLevels(
      target.scopedLevels,
      (id) =>
        !pinned.providers.has(id) ||
        (pinned.deferred.has(id) && !scope.slots.has(id)),
      (id, level) => {
        const old = pinned.providers.has(id);
        if (!old) touched.push(id);
        return buildInto(scope, target, id, old ? scope : built, run, level);
      },
      () => assertScopeOpen(scope),
    );
  } catch (error) {
    scope.run = undefined;
    throw await rollBack(
      scope,
      { ...run, owned: built.owned },
      target,
      error,
      () => (root.disposing ? root.abortErrors : scope.abortErrors),
    );
  }
  scope.run = undefined;
  scope.owned.push(...built.owned);
  scope.blueprint = target;
  const known = new Set([...pinned.modules.values()].map((m) => m.definition));
  try {
    tracer.emit(() => ({
      type: 'scope:extend',
      scope: scope.scopeId,
      modules: [...target.modules.values()]
        .filter((m) => !known.has(m.definition))
        .map((m) => m.name),
      built: levelled,
      run: trace.id,
      startMs: start,
      durationMs: tracer.now() - start,
    }));
  } catch (error) {
    // As for scope:create in buildScope.
    emitRun(tracer, trace, []);
    throw error;
  }
  emitRun(tracer, trace);
}

/**
 * Re-pins the scope to the root's current blueprint and builds the scoped
 * factories that later loads added (spec §7.4). Calls run one at a time; a
 * call for the blueprint an in-flight call targets waits for that call and
 * ends its own run with the same outcome. The
 * work joins root.inflight, so root disposal waits for it. It is async so
 * a throw before the queue, such as NEXUS_DISPOSED, rejects the promise
 * guardAsync formats.
 */
async function extendScope(scope: ScopeState): Promise<void> {
  const { root } = scope;
  const tracer = root.tracer;
  // Every call is a run (spec 3.3), a closed scope's and a shared one's too.
  const trace: RunTrace = {
    id: root.nextRun++,
    kind: 'extend',
    scope: scope.scopeId,
    start: tracer.now(),
  };
  const target = root.blueprint;
  const pending = scope.pendingExtend;
  try {
    assertScopeOpen(scope);
    if (pending?.target === target) await pending.promise;
  } catch (error) {
    // No list holds an observer's throw here (spec 3.5).
    emitRun(tracer, trace, []);
    throw error;
  }
  if (pending?.target === target) {
    emitRun(tracer, trace);
    return;
  }
  const promise = scope.extendQueue.then(() => extendNow(scope, target, trace));
  const settled = promise.then(ignore, ignore);
  scope.extendQueue = settled;
  scope.pendingExtend = { target, promise };
  void settled.then(() => {
    if (scope.pendingExtend?.promise === promise)
      scope.pendingExtend = undefined;
  });
  track(scope.root.inflight, promise);
  return promise;
}

export async function openScope(
  root: RootState,
  options?: { readonly request?: NexusRequest },
): Promise<Scope> {
  const trace: RunTrace = {
    id: root.nextRun++,
    kind: 'createScope',
    scope: null,
    start: root.tracer.now(),
  };
  let scope: ScopeState;
  try {
    assertOpen(root);
    // A construct hook that calls createScope() during create waits for the
    // singletons, and a failed create closes the root before this resumes.
    if (root.building !== undefined) {
      await root.building;
      assertOpen(root);
    }
    const bp = root.blueprint;
    if (bp.needsRequest && options?.request === undefined) {
      throw new RequestMissingError({ dependents: bp.requestDependents });
    }
    scope = createScopeState(
      root,
      options?.request,
      (state) => new ScopeHandle(state),
    );
  } catch (error) {
    // No list holds an observer's throw here (spec 3.5).
    emitRun(root.tracer, trace, []);
    throw error;
  }
  // A disposal or extend() a construct hook starts on the scope waits for
  // the build, as they wait for an extend() in flight. The queue is set
  // before the build starts, so no hook runs ahead of it.
  let settle!: () => void;
  scope.extendQueue = new Promise<void>((resolve) => {
    settle = resolve;
  });
  trace.scope = scope.scopeId;
  const work = buildScope(scope, trace);
  void work.then(settle, settle);
  track(root.inflight, work);
  return work;
}
