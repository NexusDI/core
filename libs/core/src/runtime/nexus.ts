import type { Blueprint } from '../blueprint/blueprint.js';
import { canonicalizer, pluginFailed } from '../blueprint/hooks.js';
import { viewOfBlueprint } from '../blueprint/views.js';
import type { ModuleRef } from '../definitions/define-module.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import type { Dep, DepsMap, ResolvedDeps } from '../definitions/modifiers.js';
import type { NexusRequest } from '../definitions/request.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { BlueprintError, LoadError } from '../errors/index.js';
import { isThenable } from './build.js';
import { compileTraced } from './compile-traced.js';
import { resolveDeps, validateDeps } from './deps.js';
import { formatFor, formatThrown, guardAsync } from './format.js';
import { loadModule } from './load.js';
import { getFrom, hasIn } from './lookup.js';
import type { CheckOptions, CreateOptions, LookupOptions } from './options.js';
import {
  pluginContext,
  registerPlugins,
  type PluginContext,
  type PluginSet,
} from './plugins.js';
import { rootModuleOf, type CheckedRoot, type UninferredRoot } from './root.js';
import { openScope, type Scope } from './scope.js';
import { abandonRoot, disposeRoot } from './shutdown.js';
import { startBlueprint } from './startup.js';
import { assertOpen, createRootState, track, type RootState } from './state.js';
import { Tracer, type TraceSink } from './trace.js';

let wrap: (state: RootState) => Nexus;

/**
 * A compiled, sealed container. Create one with `await Nexus.create(Root)`.
 * `get()` and `has()` are synchronous; async work happens only in `create`,
 * `load`, `createScope` and a scope's `extend()`.
 */
export class Nexus {
  readonly #state: RootState;

  static {
    wrap = (state) => new Nexus(state);
  }

  private constructor(state: RootState) {
    this.#state = state;
  }

  /**
   * Builds a container from a root: a module, a provider array, or
   * `{ providers, imports, exports }`. TypeScript checks each provider as
   * defineModule does and reports a mistake on the element or key.
   */
  static create<const R = UninferredRoot>(
    root: CheckedRoot<R>,
    options?: CreateOptions,
  ): Promise<Nexus>;
  static create(root: unknown, options?: CreateOptions): Promise<Nexus> {
    return createContainer(root, options);
  }

  /**
   * Compiles a root as create() would, without building it. Takes the same
   * root forms: a module, a provider array, or
   * `{ providers, imports, exports }`. Then compiles each module of
   * `options.load` against it, as load() would. Calls no user code but the
   * plugins' compile, tokenKey, observe and formatError hooks, so options
   * schemas and setup hooks do not run. Throws one BlueprintError for the
   * first compile that fails, and compiles no load after it.
   */
  static check<const R = UninferredRoot>(
    root: CheckedRoot<R>,
    options?: CheckOptions,
  ): void;
  static check(root: unknown, options?: CheckOptions): void {
    const plugins = registerPlugins(options?.plugins);
    const canon = canonicalizer(plugins.tokenKey);
    // The last compile that passed. A load compiles against it, and a
    // LoadError, which carries no view of its own, is formatted with its view.
    let last: Blueprint | undefined;
    try {
      const rootModule = rootModuleOf(root);
      const tracer = new Tracer(traceSinks(plugins));
      const input = {
        root: rootModule,
        pluginImports: plugins.modules,
        hooks: plugins.compile,
        canon,
        phase: 'check' as const,
        wantsView: HOOK_SITES && plugins.formatError.length > 0,
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
        () => (last === undefined ? undefined : viewOfBlueprint(last, canon)),
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
      return hasIn(this.#state, this.#state.blueprint, token, options);
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

  /**
   * Disposes the container: every public method throws NEXUS_DISPOSED from
   * the first call on. A second call returns the first call's promise.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return guardAsync(this.#state, disposeRoot(this.#state));
  }
}

/** Each plugin's observe hook, in plugin order. */
function traceSinks(plugins: PluginSet): readonly TraceSink[] {
  return plugins.observe.map((hook) => hook.call);
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
  if (!(HOOK_SITES && plugins.setup.length > 0)) {
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

/**
 * Step 3 of create: builds the singletons. A construct hook holds the
 * container before create resolves, so a load() it starts queues behind the
 * build, a createScope() waits on `building`, and a disposal awaits the
 * build through `inflight`. A failed build closes the container before
 * either waiter resumes: its methods throw NEXUS_DISPOSED and its
 * [Symbol.asyncDispose]() resolves.
 */
async function buildRoot(
  state: RootState,
  blueprint: Blueprint,
): Promise<void> {
  let release!: () => void;
  const building = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.building = building;
  state.loadQueue = building;
  // The build joins inflight before any hook runs, as runSetup's loop does.
  let start!: (build: Promise<void>) => void;
  const build = new Promise<void>((resolve) => {
    start = resolve;
  });
  track(state.inflight, build);
  try {
    start(startBlueprint(state, { bp: blueprint, isNew: () => true }));
    await build;
  } catch (error) {
    state.disposing = true;
    state.disposal ??= Promise.resolve();
    throw error;
  } finally {
    state.building = undefined;
    release();
  }
}

export async function createContainer(
  root: unknown,
  options: CreateOptions | undefined,
): Promise<Nexus> {
  const plugins = registerPlugins(options?.plugins);
  const canon = canonicalizer(plugins.tokenKey);
  // Set once compile returns: a runtime error in create reads the compiled
  // view, and a compile error carries its own through failedView().
  let compiled: Blueprint | undefined;
  try {
    const module = rootModuleOf(root);
    const tracer = new Tracer(traceSinks(plugins));
    const blueprint = compileTraced(
      tracer,
      {
        root: module,
        pluginImports: plugins.modules,
        hooks: plugins.compile,
        canon,
        phase: 'create',
        wantsView: HOOK_SITES && plugins.formatError.length > 0,
      },
      'create',
    );
    compiled = blueprint;
    const state = createRootState({
      blueprint,
      rootRef: module,
      tracer,
      initEnabled: plugins.onInit,
      plugins,
      canon,
      wrap,
    });
    await buildRoot(state, blueprint);
    await runSetup(state, plugins, state.handle);
    return state.handle;
  } catch (error) {
    throw formatThrown(
      plugins,
      () =>
        compiled === undefined ? undefined : viewOfBlueprint(compiled, canon),
      error,
    );
  }
}
