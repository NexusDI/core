import type { CompileOverrides } from '../blueprint/overrides.js';
import type { ModuleRef } from '../definitions/define-module.js';
import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { NoScopeContextError, PluginError } from '../errors/index.js';
import { compileTraced } from './compile-traced.js';
import { resolveDeps, validateDeps } from './deps.js';
import { toGraph, type NexusGraph } from './graph.js';
import { loadModule } from './load.js';
import { getFrom, hasIn } from './lookup.js';
import type { CreateOptions, LookupOptions } from './options.js';
import { pluginContext, registerPlugins, type PluginSet } from './plugins.js';
import { openScope, type Scope } from './scope.js';
import { abandonRoot, disposeRoot } from './shutdown.js';
import { startBlueprint } from './startup.js';
import { assertOpen, createRootState, type RootState } from './state.js';
import { Tracer, type TraceSink } from './trace.js';

/** Settings the testing entry sets; Nexus.create uses the defaults. */
export interface ContainerInternals {
  readonly initEnabled: boolean;
  readonly overrides?: CompileOverrides;
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

/** The `trace` option, then each plugin's observe hook, in plugin order. */
function traceSinks(
  trace: TraceSink | undefined,
  plugins: PluginSet,
): TraceSink | readonly TraceSink[] | undefined {
  if (plugins.observe.length === 0) return trace;
  const observers = plugins.observe.map((hook) => hook.call);
  return trace === undefined ? observers : [trace, ...observers];
}

/** Runs each setup hook in plugin order; a throw closes the container. */
async function runSetup(
  state: RootState,
  plugins: PluginSet,
  ship: Nexus,
): Promise<void> {
  if (plugins.setup.length === 0) return;
  const context = pluginContext(state, ship);
  for (const hook of plugins.setup) {
    try {
      hook.call(context);
    } catch (error) {
      const disposalErrors = await abandonRoot(state);
      throw new PluginError({
        code: 'NEXUS_PLUGIN_FAILED',
        plugin: hook.plugin,
        hook: 'setup',
        cause: error,
        disposalErrors,
      });
    }
  }
}

export async function createContainer(
  root: unknown,
  options: CreateOptions | undefined,
  internals: ContainerInternals,
): Promise<Nexus> {
  const plugins = registerPlugins(options?.plugins);
  const tracer = new Tracer(traceSinks(options?.trace, plugins));
  const blueprint = compileTraced(
    tracer,
    {
      root,
      pluginImports: plugins.modules,
      overrides: internals.overrides,
      hooks: plugins.compile,
      phase: 'create',
      wantsView: plugins.formatError.length > 0,
    },
    'create',
  );
  const state = createRootState({
    blueprint,
    rootRef: root,
    tracer,
    initEnabled: internals.initEnabled && plugins.onInit,
    scopeContext: options?.scopeContext,
    overrides: internals.overrides,
    plugins,
  });
  await startBlueprint(state, { bp: blueprint, isNew: () => true });
  const ship = wrap(state);
  await runSetup(state, plugins, ship);
  return ship;
}
