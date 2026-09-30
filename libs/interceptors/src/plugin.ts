import {
  defineModule,
  Nexus,
  NEXUS_PLUGIN_API,
  provide,
  Token,
  type BlueprintView,
  type ModuleDefinition,
  type NexusError,
  type NexusPlugin,
  type ProviderView,
  type Scope,
} from '@nexusdi/core';

import { bindingsFor, chainFor } from './chain.js';
import { checkBlueprint, reach } from './check.js';
import { invalid, shared } from './interceptor-error.js';
import { declarationsOf, type Declarations } from './metadata.js';
import { keyName, nameOf } from './names.js';
import { normalizeOptions, type NormalOptions } from './options.js';
import { findMethod, interceptedProxy, type Session } from './proxy.js';
import type {
  Interceptor,
  InterceptorsOptions,
  InterceptorToken,
} from './types.js';

/** What one compile says about a provider: its token and module, for matching, and the two skips. */
interface CompiledProvider {
  readonly token: unknown;
  readonly module: string;
  /** In the plugin's module: never wrapped. */
  readonly own: boolean;
  /** Reached through the plugin module's deps: global entries skip it. */
  readonly support: boolean;
}

/** Provider id to what the compile says about it. Ids are container-local. */
type Compiled = ReadonlyMap<string, CompiledProvider>;

/**
 * A create's compile, waiting for the container that builds it. The check
 * hook sees no container, so the construct hook matches its container to
 * the compiles whose providers agree with what it builds. `count` is how
 * many creates compiled this graph and have not been matched yet.
 */
interface PendingCompile {
  readonly compiled: Compiled;
  count: number;
}

/**
 * One container's session, keyed by the Nexus that builds it. Scopes of the
 * container share it.
 */
interface ContainerSession extends Session {
  readonly container: Nexus;
  /**
   * The compiles that agree with every provider the container has built so
   * far. One, once the container is matched; a load replaces it.
   */
  candidates: readonly PendingCompile[];
  /** One compile is left, and it no longer counts as pending. */
  matched: boolean;
  /** The container finished create: the plugin's dispose hook closes the session. */
  started: boolean;
  /** No container holds the session. */
  closed: boolean;
}

interface PluginState {
  /** The session of the one live container, or of the last one. */
  live: ContainerSession | undefined;
  readonly sessions: WeakMap<Nexus, ContainerSession>;
  readonly pending: PendingCompile[];
  /** Sessions whose container finished create and is not closed yet. */
  readonly started: Set<ContainerSession>;
}

/** Ends a session: calls through its proxies throw NOT_READY. */
const close = (session: ContainerSession | undefined): void => {
  if (session === undefined) return;
  session.disposed = session.closed = true;
  session.instances = undefined;
};

/** Whether two compiles say the same about every provider. */
const sameCompile = (a: Compiled, b: Compiled): boolean => {
  if (a.size !== b.size) return false;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (
      y === undefined ||
      y.token !== x.token ||
      y.module !== x.module ||
      y.own !== x.own ||
      y.support !== x.support
    )
      return false;
  }
  return true;
};

const NO_DECLARATIONS: Declarations = Object.freeze({
  classTokens: [],
  methods: new Map(),
  problems: [],
  any: false,
});

interface ProviderPlan {
  readonly global: NormalOptions['global'];
  readonly bindings: NormalOptions['bindings'];
  readonly declarations: Declarations;
  readonly chains: Map<string | symbol, readonly InterceptorToken[]>;
}

/**
 * The interceptors plugin (spec section 5). Registers every interceptor in
 * one module with a private registry factory that core builds before any
 * onInit, and wraps class and factory instances that have interceptors.
 */
export function interceptors(options: InterceptorsOptions): NexusPlugin {
  const config = normalizeOptions(options);
  const tokens = config.registered.map((entry) => entry.token);
  const REGISTRY = new Token<unknown>('interceptors registry');
  const GUARD = new Token<object>('interceptors guard');
  const state: PluginState = {
    live: undefined,
    sessions: new WeakMap(),
    pending: [],
    started: new Set(),
  };

  /** Maps each registered token to its built interceptor (spec R1). */
  const bind = (...instances: unknown[]): unknown => {
    const map = new Map<unknown, Interceptor>();
    instances.forEach((instance, index) => {
      const token = tokens[index];
      if (
        typeof (instance as { intercept?: unknown } | null)?.intercept !==
        'function'
      )
        throw invalid('no-intercept', { token: nameOf(token) });
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
  const isLive = (session: ContainerSession): boolean => {
    if (session.closed) return false;
    try {
      session.container.has(GUARD);
      return true;
    } catch {
      return false;
    }
  };

  /** The compile of a create or load, as the construct hook reads it. */
  const compileOf = (view: BlueprintView, ownId: string): Compiled => {
    const support = reach(
      view,
      view.providers.filter((p) => p.module === ownId).map((p) => p.id),
    );
    return new Map(
      view.providers.map((p) => [
        p.id,
        {
          token: p.token,
          module: p.module,
          own: p.module === ownId,
          support: support.has(p.id),
        },
      ]),
    );
  };

  /**
   * The session of the container building `provider`. A scope builds for
   * the one live container. A container's first build claims the plugin
   * object, which fails while another container holds it (spec R9).
   */
  const sessionFor = (
    container: Nexus | Scope,
  ): ContainerSession | undefined => {
    if (!(container instanceof Nexus)) return state.live;
    let session = state.sessions.get(container);
    if (session !== undefined) return session;
    const live = state.live;
    if (live !== undefined && isLive(live)) throw shared();
    session = {
      container,
      candidates: state.pending.filter((p) => p.count > 0),
      matched: false,
      instances: undefined,
      disposed: false,
      started: false,
      closed: false,
    };
    state.sessions.set(container, session);
    state.live = session;
    return session;
  };

  /**
   * What the session's compiles say about `provider`. Keeps the compiles
   * that agree with it; when one is left, the container is matched and
   * takes it out of the pending list. Compiles that disagree on the skips
   * cannot be told apart, so the build fails (spec R9).
   */
  const compiledFor = (
    session: ContainerSession,
    provider: ProviderView,
  ): CompiledProvider => {
    const kept: PendingCompile[] = [];
    let found: CompiledProvider | undefined;
    for (const candidate of session.candidates) {
      const entry = candidate.compiled.get(provider.id);
      if (
        entry === undefined ||
        entry.token !== provider.token ||
        entry.module !== provider.module
      )
        continue;
      if (
        found !== undefined &&
        (found.own !== entry.own || found.support !== entry.support)
      )
        throw shared();
      found = entry;
      kept.push(candidate);
    }
    if (found === undefined) throw shared();
    if (!session.matched && kept.length === 1) {
      const [match] = kept as [PendingCompile];
      session.matched = true;
      match.count--;
      if (match.count === 0)
        state.pending.splice(state.pending.indexOf(match), 1);
    }
    session.candidates = kept;
    return found;
  };

  /** A disposer that closes the session when its container never finished create. */
  const guardFor = (session: ContainerSession): Disposable => ({
    [Symbol.dispose]() {
      if (!session.started) close(session);
    },
  });

  const plans = new WeakMap<ProviderView, ProviderPlan>();
  const planFor = (provider: ProviderView, support: boolean): ProviderPlan => {
    let plan = plans.get(provider);
    if (plan === undefined) {
      plan = {
        global: support ? [] : config.global,
        bindings: bindingsFor(provider, config.bindings),
        declarations:
          provider.implementation === null
            ? NO_DECLARATIONS
            : declarationsOf(provider.implementation),
        chains: new Map(),
      };
      plans.set(provider, plan);
    }
    return plan;
  };

  return {
    name: 'nexus:interceptors',
    apiVersion: NEXUS_PLUGIN_API,
    modules: [module],
    compile: {
      check(view: BlueprintView, report: (error: NexusError) => void): void {
        const own = view.modules.find(
          (m) => m.definition === module || m.replaced === module,
        );
        let failed = !view.complete;
        checkBlueprint(
          view,
          (error) => {
            failed = true;
            report(error);
          },
          config,
          own?.id,
        );
        if (view.phase === 'check' || failed || own === undefined) return;
        const live = state.live;
        const compiled = compileOf(view, own.id);
        if (view.phase === 'load') {
          // A load compiles for the one live container; its view holds
          // every provider the container has.
          if (live !== undefined && isLive(live)) {
            live.candidates = [{ compiled, count: 0 }];
            live.matched = true;
          }
          return;
        }
        // A live container holds the plugin object. Failing here, before
        // any build, leaves its session alone (spec R9).
        if (live !== undefined && isLive(live)) {
          report(shared());
          return;
        }
        const same = state.pending.find((p) =>
          sameCompile(p.compiled, compiled),
        );
        if (same === undefined) state.pending.push({ compiled, count: 1 });
        else same.count++;
      },
    },
    setup(context) {
      const session = state.sessions.get(context.container);
      if (session === undefined) return;
      session.started = true;
      state.started.add(session);
    },
    dispose() {
      // Core runs this after it disposes every instance the container
      // owns, so a disposer that calls an intercepted method still runs
      // its interceptors (spec section 6). The hook names no container, so
      // it closes each started session whose container is closed: a
      // container that claimed the plugin object meanwhile keeps its own.
      for (const session of state.started) {
        if (isLive(session)) continue;
        close(session);
        state.started.delete(session);
      }
    },
    construct(instance, provider, scope, container) {
      const session = sessionFor(container);
      if (session === undefined || session.closed) return undefined;
      const compiled = compiledFor(session, provider);
      if (compiled.own) {
        if (provider.token === REGISTRY)
          session.instances = instance as ReadonlyMap<unknown, Interceptor>;
        return provider.token === GUARD ? guardFor(session) : undefined;
      }
      if (
        (typeof instance !== 'object' && typeof instance !== 'function') ||
        instance === null
      )
        return undefined;
      const plan = planFor(provider, compiled.support);
      if (
        plan.global.length === 0 &&
        plan.bindings.length === 0 &&
        !plan.declarations.any
      )
        return undefined;
      for (const binding of plan.bindings) {
        for (const key of binding.methods.keys()) {
          if (findMethod(instance, key) === undefined)
            throw invalid('unknown-method', {
              target: provider.name,
              method: keyName(key),
            });
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
