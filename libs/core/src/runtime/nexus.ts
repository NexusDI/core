import { compile } from '../blueprint/compile.js';
import type { ModuleRef } from '../definitions/define-module.js';
import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { NoScopeContextError } from '../errors/index.js';
import { resolveDeps, validateDeps } from './deps.js';
import { toGraph, type NexusGraph } from './graph.js';
import { loadModule } from './load.js';
import { getFrom, hasIn } from './lookup.js';
import type { CreateOptions, LookupOptions } from './options.js';
import { openScope, type Scope } from './scope.js';
import { disposeRoot } from './shutdown.js';
import { startBlueprint } from './startup.js';
import { assertOpen, createRootState, type RootState } from './state.js';
import { Tracer } from './trace.js';

/** Settings the testing entry sets; Nexus.create uses the defaults. */
export interface ContainerInternals {
  readonly initEnabled: boolean;
}

let wrap: (state: RootState) => Nexus;

/**
 * A compiled, sealed container. Create one with `await Nexus.create(Root)`.
 * `get()` and `has()` are synchronous; async work happens only in `create`,
 * `load` and `createScope`.
 */
export class Nexus {
  readonly #state: RootState;

  static {
    wrap = (state) => new Nexus(state);
  }

  private constructor(state: RootState) {
    this.#state = state;
  }

  /** Compiles the module graph, builds every singleton, and returns the sealed container. */
  static create(root: ModuleRef, options?: CreateOptions): Promise<Nexus> {
    return createContainer(root, options, { initEnabled: true });
  }

  get<T>(token: MultiToken<T>, options?: LookupOptions): T[];
  get<T>(token: InjectionToken<T>, options?: LookupOptions): T;
  get(token: unknown, options?: LookupOptions): unknown {
    assertOpen(this.#state);
    return getFrom(
      this.#state,
      this.#state.blueprint,
      token,
      options,
      'root-transient',
    );
  }

  has(
    token: InjectionToken<unknown> | MultiToken<unknown>,
    options?: LookupOptions,
  ): boolean {
    assertOpen(this.#state);
    return hasIn(this.#state.blueprint, token, options);
  }

  /** Resolves a deps map or tuple from the root, with the rules of root get(). */
  resolve<const D extends DepsMap | readonly Dep[]>(
    deps: D,
    options?: LookupOptions,
  ): ResolvedDeps<D> {
    assertOpen(this.#state);
    return resolveDeps(
      this.#state,
      this.#state.blueprint,
      deps,
      options,
      'root-transient',
    ) as ResolvedDeps<D>;
  }

  /**
   * Checks at startup that every required and lazy entry has a provider
   * visible from the root module, or from `options.module`. Builds nothing.
   * Throws one BlueprintError holding an error per failing entry.
   */
  validate(deps: DepsMap | readonly Dep[], options?: LookupOptions): void {
    assertOpen(this.#state);
    validateDeps(this.#state, this.#state.blueprint, deps, options);
  }

  /**
   * Adds a module after startup. Its exports become visible at the root once
   * its singletons are built. Concurrent calls run one at a time, in call order.
   */
  load(module: ModuleRef): Promise<void> {
    return loadModule(this.#state, module);
  }

  /**
   * Creates a scope and builds its scoped factories. Pass the request that
   * REQUEST resolves to inside the scope.
   */
  createScope(options?: { readonly request?: NexusRequest }): Promise<Scope> {
    return openScope(this.#state, options);
  }

  /** Runs `fn` with `scope` as the current scope. Needs the scopeContext option. */
  runInScope<R>(scope: Scope, fn: () => R): R {
    assertOpen(this.#state);
    const context = this.#state.scopeContext;
    if (context === undefined) throw new NoScopeContextError();
    return context.run(scope, fn);
  }

  /** The scope runInScope() bound to the current async context, or undefined. */
  currentScope(): Scope | undefined {
    return this.#state.scopeContext?.current();
  }

  /** The compiled graph as plain JSON, including modules added by load(). Works after disposal. */
  graph(): NexusGraph {
    return toGraph(this.#state.blueprint, this.#state.asyncFlags);
  }

  /**
   * Disposes the container: every public method throws NEXUS_DISPOSED from
   * the first call on. A second call returns the first call's promise.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return disposeRoot(this.#state);
  }
}

export async function createContainer(
  root: unknown,
  options: CreateOptions | undefined,
  internals: ContainerInternals,
): Promise<Nexus> {
  const tracer = new Tracer(options?.trace);
  const blueprint = compile({ root });
  const state = createRootState({
    blueprint,
    rootRef: root,
    tracer,
    initEnabled: internals.initEnabled,
    scopeContext: options?.scopeContext,
  });
  await startBlueprint(state, { bp: blueprint, isNew: () => true });
  return wrap(state);
}
