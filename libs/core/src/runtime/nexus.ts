import type { Blueprint } from '../blueprint/blueprint.js';
import { pluginFailed } from '../blueprint/hooks.js';
import type { CompileOverrides } from '../blueprint/overrides.js';
import { viewOfBlueprint } from '../blueprint/views.js';
import type { ModuleRef } from '../definitions/define-module.js';
import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import {
  BlueprintError,
  LoadError,
  NoScopeContextError,
} from '../errors/index.js';
import { isThenable } from './build.js';
import { compileTraced } from './compile-traced.js';
import { resolveDeps, validateDeps } from './deps.js';
import { formatFor, formatThrown, guardAsync } from './format.js';
import { toGraph, type NexusGraph } from './graph.js';
import { loadModule } from './load.js';
import { getFrom, hasIn } from './lookup.js';
import type { CheckOptions, CreateOptions, LookupOptions } from './options.js';
import {
  pluginContext,
  registerPlugins,
  type PluginContext,
  type PluginSet,
} from './plugins.js';
import { openScope, type Scope } from './scope.js';
import { abandonRoot, disposeRoot } from './shutdown.js';
import { startBlueprint } from './startup.js';
import { assertOpen, createRootState, track, type RootState } from './state.js';
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

  /**
   * Compiles `root` and then each module of `options.load` against it, as
   * load() would. Builds nothing and calls no user code but the plugins'
   * compile, observe and formatError hooks, so options schemas and setup
   * hooks do not run. Throws one BlueprintError for the first compile that
   * fails, and compiles no load after it.
   */
  static check(root: ModuleRef, options?: CheckOptions): void {
    const plugins = registerPlugins(options?.plugins);
    // The last compile that passed. A load compiles against it, and a
    // LoadError, which carries no view of its own, is formatted with its view.
    let last: Blueprint | undefined;
    try {
      const tracer = new Tracer(traceSinks(undefined, plugins));
      const input = {
        root,
        pluginImports: plugins.modules,
        hooks: plugins.compile,
        phase: 'check' as const,
        wantsView: plugins.formatError.length > 0,
      };
      last = compileTraced(tracer, input, 'check');
      for (const module of options?.load ?? []) {
        last = compileTraced(
          tracer,
          {
            ...input,
            extraImports: [...last.extraImports, module],
            previous: last,
          },
          'check',
        );
      }
    } catch (error) {
      throw formatThrown(
        plugins,
        () => (last === undefined ? undefined : viewOfBlueprint(last)),
        error instanceof LoadError ? new BlueprintError([error]) : error,
      );
    }
  }

  get<T>(token: MultiToken<T>, options?: LookupOptions): T[];
  get<T>(token: InjectionToken<T>, options?: LookupOptions): T;
  get(token: unknown, options?: LookupOptions): unknown {
    try {
      assertOpen(this.#state);
      return getFrom(
        this.#state,
        this.#state.blueprint,
        token,
        options,
        'root-transient',
      );
    } catch (error) {
      throw formatFor(this.#state, error);
    }
  }

  has(
    token: InjectionToken<unknown> | MultiToken<unknown>,
    options?: LookupOptions,
  ): boolean {
    try {
      assertOpen(this.#state);
      return hasIn(this.#state.blueprint, token, options);
    } catch (error) {
      throw formatFor(this.#state, error);
    }
  }

  /** Resolves a deps map or tuple from the root, with the rules of root get(). */
  resolve<const D extends DepsMap | readonly Dep[]>(
    deps: D,
    options?: LookupOptions,
  ): ResolvedDeps<D> {
    try {
      assertOpen(this.#state);
      return resolveDeps(
        this.#state,
        this.#state.blueprint,
        deps,
        options,
        'root-transient',
      ) as ResolvedDeps<D>;
    } catch (error) {
      throw formatFor(this.#state, error);
    }
  }

  /**
   * Checks at startup that every required and lazy entry has a provider
   * visible from the root module, or from `options.module`. Builds nothing.
   * Throws one BlueprintError holding an error per failing entry.
   */
  validate(deps: DepsMap | readonly Dep[], options?: LookupOptions): void {
    try {
      assertOpen(this.#state);
      validateDeps(this.#state, this.#state.blueprint, deps, options);
    } catch (error) {
      throw formatFor(this.#state, error);
    }
  }

  /**
   * Adds a module after startup. Its exports become visible at the root once
   * its singletons are built. Concurrent calls run one at a time, in call order.
   */
  load(module: ModuleRef): Promise<void> {
    return guardAsync(this.#state, loadModule(this.#state, module));
  }

  /**
   * Creates a scope and builds its scoped factories. Pass the request that
   * REQUEST resolves to inside the scope.
   */
  createScope(options?: { readonly request?: NexusRequest }): Promise<Scope> {
    return guardAsync(this.#state, openScope(this.#state, options));
  }

  /** Runs `fn` with `scope` as the current scope. Needs the scopeContext option. */
  runInScope<R>(scope: Scope, fn: () => R): R {
    const context = this.#state.scopeContext;
    try {
      assertOpen(this.#state);
      if (context === undefined) throw new NoScopeContextError({});
    } catch (error) {
      throw formatFor(this.#state, error);
    }
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
    return guardAsync(this.#state, disposeRoot(this.#state));
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

/** A setup hook's throw or rejection, carried out of the tracked setup loop. */
class SetupFailure {
  constructor(
    readonly plugin: string,
    readonly error: unknown,
  ) {}
}

/**
 * Runs each setup hook in plugin order, awaiting a returned thenable before
 * the next. `pluginsStarted` counts the plugins whose setup step settled. A
 * disposal that started during a setup stops the loop once that setup
 * settles.
 */
async function setupLoop(
  state: RootState,
  plugins: PluginSet,
  context: PluginContext,
): Promise<void> {
  for (const hook of plugins.setup) {
    state.pluginsStarted = hook.index;
    try {
      const result = hook.call(context);
      if (isThenable(result)) await result;
    } catch (error) {
      throw new SetupFailure(hook.plugin, error);
    }
    state.pluginsStarted = hook.index + 1;
    assertOpen(state);
  }
  state.pluginsStarted = plugins.count;
}

/**
 * Step 4 of create. The loop joins `inflight` before any hook runs, so a
 * disposal a hook starts waits for it, as it waits for a load(). A failed
 * setup closes the container: `track` drops the loop from `inflight` before
 * this catch runs, since it subscribed first, so abandonRoot never waits on
 * the loop that called it.
 */
async function runSetup(
  state: RootState,
  plugins: PluginSet,
  ship: Nexus,
): Promise<void> {
  if (plugins.setup.length === 0) {
    state.pluginsStarted = plugins.count;
    return;
  }
  const context = pluginContext(state, ship);
  let start!: (loop: Promise<void>) => void;
  const work = new Promise<void>((resolve) => {
    start = resolve;
  });
  track(state.inflight, work);
  start(setupLoop(state, plugins, context));
  try {
    await work;
  } catch (error) {
    if (!(error instanceof SetupFailure)) throw error;
    const disposalErrors = await abandonRoot(state);
    throw pluginFailed(error.plugin, 'setup', error.error, disposalErrors);
  }
}

export async function createContainer(
  root: unknown,
  options: CreateOptions | undefined,
  internals: ContainerInternals,
): Promise<Nexus> {
  const plugins = registerPlugins(options?.plugins);
  // Set once compile returns: a runtime error in create reads the compiled
  // view, and a compile error carries its own through failedView().
  let compiled: Blueprint | undefined;
  try {
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
    compiled = blueprint;
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
  } catch (error) {
    throw formatThrown(
      plugins,
      () => (compiled === undefined ? undefined : viewOfBlueprint(compiled)),
      error,
    );
  }
}
