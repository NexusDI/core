import type { Blueprint } from '../blueprint/blueprint.js';
import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { DisposedError, RequestMissingError } from '../errors/index.js';
import { buildLevels } from './build-levels.js';
import { adopt, applyConstruct, buildInto, store } from './build.js';
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
  type ScopeState,
} from './state.js';
import { reportDisposal } from './trace.js';

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
 * Builds one scoped provider of `bp` into the scope's slots. `owner` takes
 * the instance and the transients built as its deps: the scope itself in
 * createScope, extend()'s own list in extend().
 */
async function buildScoped(
  scope: ScopeState,
  bp: Blueprint,
  id: string,
  owner: Owner = scope,
): Promise<void> {
  const built = await buildInto(scope, bp, id, owner);
  const { record, isAsync, start } = built;
  const value = applyConstruct(scope, owner, bp, record, built.value);
  adopt(owner, record, value);
  store(scope, bp, record, value, start, isAsync, true);
}

/**
 * Builds every scoped factory and the scoped providers they depend on, level
 * by level. The runtime cannot tell a sync factory from an async one without
 * calling it, so every scoped factory runs here, once per scope.
 */
async function buildScope(scope: ScopeState): Promise<Scope> {
  const { root } = scope;
  const tracer = root.tracer;
  const start = tracer.now();
  let built = 0;
  try {
    built = await buildLevels(
      scope.blueprint.scopedLevels,
      () => true,
      (id) => buildScoped(scope, scope.blueprint, id),
      () => assertOpen(root),
    );
    assertOpen(root);
  } catch (error) {
    // createScope never returns the scope, but a construct hook may hold its
    // handle, so the scope closes: its methods throw NEXUS_DISPOSED and its
    // [Symbol.asyncDispose]() resolves. Its slots then need no abandoning.
    scope.disposal = Promise.resolve();
    throw await rollBack(
      scope,
      { touched: [], owned: scope.owned },
      scope.blueprint,
      error,
      () => (root.disposing ? root.abortErrors : undefined),
    );
  }
  root.scopes.add(scope);
  tracer.emit(() => ({
    type: 'scope:create',
    scope: scope.scopeId,
    built,
    durationMs: tracer.now() - start,
  }));
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
async function extendNow(scope: ScopeState, target: Blueprint): Promise<void> {
  const { root } = scope;
  assertScopeOpen(scope);
  const pinned = scope.blueprint;
  if (target === pinned) return;
  const dependents = target.requestDependents.filter(
    (name) => !pinned.requestDependents.includes(name),
  );
  if (dependents.length > 0 && scope.request === undefined)
    throw new RequestMissingError({ dependents });

  const tracer = root.tracer;
  const start = tracer.now();
  const built: Owner = { root, owned: [] };
  const touched: string[] = [];
  let levelled = 0;
  // A provider the delta adds that a request builds on first use while
  // extend() runs joins built and touched too (scope.run).
  scope.run = {
    isNew: (id) => !pinned.providers.has(id),
    owner: built,
    touched,
  };
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
      (id) => {
        const old = pinned.providers.has(id);
        if (!old) touched.push(id);
        return buildScoped(scope, target, id, old ? scope : built);
      },
      () => assertScopeOpen(scope),
    );
  } catch (error) {
    scope.run = undefined;
    throw await rollBack(
      scope,
      { touched, owned: built.owned },
      target,
      error,
      () => (root.disposing ? root.abortErrors : scope.abortErrors),
    );
  }
  scope.run = undefined;
  scope.owned.push(...built.owned);
  scope.blueprint = target;
  const known = new Set([...pinned.modules.values()].map((m) => m.definition));
  tracer.emit(() => ({
    type: 'scope:extend',
    scope: scope.scopeId,
    modules: [...target.modules.values()]
      .filter((m) => !known.has(m.definition))
      .map((m) => m.name),
    built: levelled,
    durationMs: tracer.now() - start,
  }));
}

/**
 * Re-pins the scope to the root's current blueprint and builds the scoped
 * factories that later loads added (spec §7.4). Calls run one at a time; a
 * call for the blueprint an in-flight call targets shares its promise. The
 * work joins root.inflight, so root disposal waits for it. It is async so
 * a throw before the queue, such as NEXUS_DISPOSED, rejects the promise
 * guardAsync formats.
 */
async function extendScope(scope: ScopeState): Promise<void> {
  assertScopeOpen(scope);
  const target = scope.root.blueprint;
  if (scope.pendingExtend?.target === target)
    return scope.pendingExtend.promise;
  const promise = scope.extendQueue.then(() => extendNow(scope, target));
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
  const work = buildScope(
    createScopeState(root, options?.request, (state) => new ScopeHandle(state)),
  );
  track(root.inflight, work);
  return work;
}
