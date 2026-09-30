import {
  defineModule,
  displayName,
  NEXUS_PLUGIN_API,
  provide,
  Token,
  type BlueprintView,
  type ModuleDefinition,
  type Nexus,
  type NexusError,
  type NexusPlugin,
  type ProviderView,
} from '@nexusdi/core';

import { bindingsFor, chainFor } from './chain.js';
import { checkBlueprint, reach } from './check.js';
import {
  errorOf,
  invalidAt,
  sharedAtBuild,
  unchecked,
} from './interceptor-error.js';
import { declarationsOf, keyName, type Declarations } from './metadata.js';
import { parseOptions, type NormalOptions } from './options.js';
import { findMethod, interceptedProxy, type Session } from './proxy.js';
import type {
  Interceptor,
  InterceptorsOptions,
  InterceptorToken,
} from './types.js';

/**
 * One container's session. Every compile the container runs, its create
 * and each load, leads to it, and so does every scope of the container.
 */
interface ContainerSession extends Session {
  /** The container whose first build opened the session; unset once the session closes. */
  container: Nexus | undefined;
  /** The container finished create: the plugin's dispose hook closes the session. */
  started: boolean;
  /** No container holds the session. */
  closed: boolean;
}

/**
 * One create or load that compile.check saw. A create's session starts at
 * its first build, which is always the guard's (it is a singleton with no
 * deps). A load joins the live container's session (spec R9).
 */
interface Compile {
  session: ContainerSession | undefined;
}

interface ProviderPlan {
  readonly global: NormalOptions['global'];
  readonly bindings: NormalOptions['bindings'];
  readonly declarations: Declarations;
  readonly chains: Map<string | symbol, readonly InterceptorToken[]>;
}

/**
 * What a compile says about one provider view. `own` names the plugin's
 * registry and guard; `support` is a provider the plugin's module reaches
 * through its deps, which global entries skip (spec R11). `plan` fills on
 * the first wrapped build.
 */
interface CompiledProvider {
  readonly compile: Compile;
  readonly own: 'registry' | 'guard' | null;
  readonly support: boolean;
  plan?: ProviderPlan;
}

const NO_DECLARATIONS: Declarations = Object.freeze({
  classTokens: [],
  methods: new Map(),
  problems: [],
  any: false,
});

/**
 * The interceptors plugin (spec section 5). Registers every interceptor in
 * one module with a private registry factory that core builds before any
 * onInit, and wraps class and factory instances that have interceptors.
 * Bad options make every hook but compile.check a no-op; the check reports
 * each fault (spec section 2.5.12 of the extension principle).
 */
export function interceptors(options: InterceptorsOptions): NexusPlugin {
  const parsed = parseOptions(options);
  if (Array.isArray(parsed))
    return {
      name: 'nexus:interceptors',
      apiVersion: NEXUS_PLUGIN_API,
      compile: {
        check(_view: BlueprintView, report: (error: NexusError) => void) {
          for (const fault of parsed) report(errorOf(fault));
        },
      },
    };
  const config = parsed;
  const tokens = config.registered.map((entry) => entry.token);
  const REGISTRY = new Token<unknown>('interceptors registry');
  const GUARD = new Token<object>('interceptors guard');
  /** The session of the one live container, until the session closes. */
  let live: ContainerSession | undefined;
  /** Sessions whose container finished create and is not closed yet. */
  const started = new Set<ContainerSession>();
  /**
   * Keyed by the provider views core hands both compile.check and construct
   * (core 3.10.3). null for a provider with nothing to wrap.
   */
  const entries = new WeakMap<ProviderView, CompiledProvider | null>();

  /** Maps each registered token to its built interceptor (spec R1). */
  const bind = (...instances: unknown[]): unknown => {
    const map = new Map<unknown, Interceptor>();
    instances.forEach((instance, index) => {
      const token = tokens[index];
      if (
        typeof (instance as { intercept?: unknown } | null)?.intercept !==
        'function'
      ) {
        const name = displayName(token);
        throw invalidAt(
          'no-intercept',
          { token: name },
          `the interceptor ${name} has no intercept(call, next) method.`,
        );
      }
      map.set(token, instance as Interceptor);
    });
    return map;
  };

  const module: ModuleDefinition = defineModule({
    name: 'interceptors',
    imports: config.imports,
    providers: [
      ...config.registered.map((entry) => entry.provider),
      ...config.providers,
      provide(REGISTRY, { deps: tokens, useFactory: bind } as never),
      // A singleton with no deps, so core builds it in the first level. The
      // construct hook replaces it with a disposer bound to the container's
      // session (spec section 6).
      provide(GUARD, { useFactory: () => ({}) }),
    ],
  });

  /**
   * Whether the session's container is open. has() throws NEXUS_DISPOSED
   * once disposal starts, and core closes a container whose create failed.
   */
  const isLive = (session: ContainerSession | undefined): boolean => {
    if (session?.container === undefined) return false;
    try {
      session.container.has(GUARD);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Ends a session: calls through its proxies throw NOT_READY. The plugin
   * then holds no instance, context or container of it.
   */
  const close = (session: ContainerSession): void => {
    session.disposed = session.closed = true;
    session.instances = undefined;
    session.context = undefined;
    session.container = undefined;
    if (live === session) live = undefined;
  };

  /** A disposer that closes the session when its container never finished create. */
  const guardFor = (session: ContainerSession): Disposable => ({
    [Symbol.dispose]() {
      if (!session.started) close(session);
    },
  });

  /** Writes an entry for every class and factory provider of the compile. */
  const record = (view: BlueprintView, compile: Compile, ownId: string) => {
    const support = reach(
      view,
      view.providers.filter((p) => p.module === ownId).map((p) => p.id),
    );
    for (const provider of view.providers) {
      // construct runs for class and factory instances only.
      if (provider.kind !== 'class' && provider.kind !== 'factory') continue;
      const inside = provider.module === ownId;
      const own =
        inside && provider.written === REGISTRY
          ? 'registry'
          : inside && provider.written === GUARD
            ? 'guard'
            : null;
      const skipsGlobal = support.has(provider.id);
      const wraps =
        own !== null ||
        (!inside &&
          ((!skipsGlobal && config.global.length > 0) ||
            bindingsFor(provider, config.bindings).length > 0 ||
            (provider.implementation !== null &&
              declarationsOf(provider.implementation).any)));
      entries.set(
        provider,
        wraps ? { compile, own, support: skipsGlobal } : null,
      );
    }
  };

  const planFor = (
    provider: ProviderView,
    entry: CompiledProvider,
  ): ProviderPlan =>
    (entry.plan ??= {
      global: entry.support ? [] : config.global,
      bindings: bindingsFor(provider, config.bindings),
      declarations:
        provider.implementation === null
          ? NO_DECLARATIONS
          : declarationsOf(provider.implementation),
      chains: new Map(),
    });

  return {
    name: 'nexus:interceptors',
    apiVersion: NEXUS_PLUGIN_API,
    modules: [module],
    compile: {
      check(view: BlueprintView, report: (error: NexusError) => void): void {
        const own = view.modules.find(
          (m) => m.definition === module || m.replaced === module,
        );
        for (const fault of checkBlueprint(view, config, own?.id))
          report(errorOf(fault));
        if (view.phase === 'check' || own === undefined) return;
        if (view.phase === 'load') {
          // A load runs inside the one live container (spec R9).
          record(view, { session: isLive(live) ? live : undefined }, own.id);
          return;
        }
        // A live container holds the plugin object. Failing here, before
        // any build, leaves its session alone (spec R9).
        if (isLive(live)) {
          report(errorOf({ code: 'NEXUS_INTERCEPTORS_SHARED' }));
          return;
        }
        // A compile that fails later keeps nothing: core drops its views.
        record(view, { session: undefined }, own.id);
      },
    },
    setup(context) {
      if (live === undefined || live.container !== context.container) return;
      live.started = true;
      live.context = context;
      started.add(live);
    },
    dispose() {
      // Core runs this after it disposes every instance the container
      // owns, so a disposer that calls an intercepted method still runs
      // its interceptors (spec section 6). The hook names no container, so
      // it closes each started session whose container is closed: a
      // container that claimed the plugin object meanwhile keeps its own.
      for (const session of started) {
        if (isLive(session)) continue;
        close(session);
        started.delete(session);
      }
    },
    construct(instance, provider, scope, container) {
      const entry = entries.get(provider);
      // Every view core builds from passed compile.check (core 3.10.3), so
      // a miss is a core that breaks that rule or a caller outside core.
      if (entry === undefined) throw unchecked(provider.name);
      if (entry === null) return undefined;
      let session = entry.compile.session;
      if (session === undefined) {
        // A create's first build is the root container's, which claims the
        // plugin object. It fails while another container holds it, as when
        // two creates overlap (spec R9).
        if (isLive(live)) throw sharedAtBuild();
        session =
          entry.compile.session =
          live =
            {
              container: container as Nexus,
              instances: undefined,
              disposed: false,
              context: undefined,
              started: false,
              closed: false,
            };
      }
      if (entry.own === 'registry') {
        if (!session.closed)
          session.instances = instance as ReadonlyMap<unknown, Interceptor>;
        return undefined;
      }
      if (entry.own === 'guard') return guardFor(session);
      if (
        (typeof instance !== 'object' && typeof instance !== 'function') ||
        instance === null
      )
        return undefined;
      const plan = planFor(provider, entry);
      for (const binding of plan.bindings) {
        for (const key of binding.methods.keys()) {
          if (findMethod(instance, key) === undefined) {
            const method = keyName(key);
            throw invalidAt(
              'unknown-method',
              { target: provider.name, method },
              `${provider.name} has a binding for ${method}, which is not a method of the instance its provider built.\n  Fix: correct the method name in interceptors({ bindings }).`,
            );
          }
        }
      }
      return interceptedProxy(instance, provider, scope, {
        session,
        chain: (key) => {
          let chain = plan.chains.get(key);
          if (chain === undefined) {
            chain = chainFor(
              provider,
              key,
              plan.global,
              plan.bindings,
              plan.declarations,
            );
            plan.chains.set(key, chain);
          }
          return chain;
        },
      });
    },
  };
}
