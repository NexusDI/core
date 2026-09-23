import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { DisposedError, RequestMissingError } from '../errors/index.js';
import { adopt, buildInto, traceConstruct } from './build.js';
import { resolveDeps } from './deps.js';
import { chainErrors, disposeInReverse } from './dispose.js';
import { getFrom, hasIn } from './lookup.js';
import type { LookupOptions } from './options.js';
import { settleLevel, toProviderError } from './settle.js';
import {
  assertOpen,
  createScopeState,
  track,
  type RootState,
  type ScopeState,
} from './state.js';
import { reportDisposal } from './trace.js';

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
  /** Disposes the scope's scoped and transient instances. A second call returns the first call's promise. */
  [Symbol.asyncDispose](): Promise<void>;
}

export function assertScopeOpen(scope: ScopeState): void {
  if (scope.disposal !== undefined)
    throw new DisposedError({ target: 'scope' });
  if (scope.root.disposing) throw new DisposedError({ target: 'container' });
}

export function disposeScope(scope: ScopeState): Promise<void> {
  scope.disposal ??= (async () => {
    const tracer = scope.root.tracer;
    const start = tracer.now();
    try {
      const report = await disposeInReverse(
        scope.owned,
        scope.root.ownership,
        reportDisposal(tracer, scope.scopeId),
      );
      tracer.emit(() => ({
        type: 'scope:dispose',
        scope: scope.scopeId,
        disposed: report.disposed,
        errors: report.errors.length,
        durationMs: tracer.now() - start,
      }));
      const chained = chainErrors(report.errors);
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
    assertScopeOpen(this.#state);
    return getFrom(
      this.#state,
      this.#state.blueprint,
      token,
      options,
      this.#state,
    );
  }

  has(
    token: InjectionToken<unknown> | MultiToken<unknown>,
    options?: LookupOptions,
  ): boolean {
    assertScopeOpen(this.#state);
    return hasIn(this.#state.blueprint, token, options);
  }

  resolve<const D extends DepsMap | readonly Dep[]>(
    deps: D,
    options?: LookupOptions,
  ): ResolvedDeps<D> {
    assertScopeOpen(this.#state);
    return resolveDeps(
      this.#state,
      this.#state.blueprint,
      deps,
      options,
      this.#state,
    ) as ResolvedDeps<D>;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return disposeScope(this.#state);
  }
}

async function buildScoped(scope: ScopeState, id: string): Promise<void> {
  const { record, value, isAsync, start } = await buildInto(
    scope,
    scope.blueprint,
    id,
  );
  scope.slots.settle(id, value);
  scope.slots.markReady(id);
  if (record.kind === 'factory') scope.root.asyncFlags.set(id, isAsync);
  adopt(scope, record, value);
  traceConstruct(scope, scope.blueprint, record, isAsync, start);
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
    for (const level of scope.blueprint.scopedLevels) {
      built += level.length;
      await settleLevel(level, (id) => buildScoped(scope, id));
    }
  } catch (error) {
    const { errors } = await disposeInReverse(
      scope.owned,
      root.ownership,
      reportDisposal(tracer, scope.scopeId),
    );
    throw toProviderError(error, scope.blueprint, errors);
  }
  root.scopes.add(scope);
  tracer.emit(() => ({
    type: 'scope:create',
    scope: scope.scopeId,
    built,
    durationMs: tracer.now() - start,
  }));
  return new ScopeHandle(scope);
}

export async function openScope(
  root: RootState,
  options?: { readonly request?: NexusRequest },
): Promise<Scope> {
  assertOpen(root);
  const bp = root.blueprint;
  if (bp.needsRequest && options?.request === undefined) {
    throw new RequestMissingError({ dependents: bp.requestDependents });
  }
  const work = buildScope(createScopeState(root, options?.request));
  track(root.inflight, work);
  return work;
}
