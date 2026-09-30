import {
  defineModule,
  NEXUS_PLUGIN_API,
  provide,
  Token,
  type BlueprintView,
  type ModuleDefinition,
  type NexusError,
  type NexusPlugin,
  type ProviderView,
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

/**
 * One container's session. Module and provider ids are container-local
 * (`m0`, `p3`), so they live on the session of the container that compiled
 * them and never leak into another container's.
 */
interface ContainerSession extends Session {
  /** The plugin module's id (spec 5.2). */
  readonly moduleIds: Set<string>;
  /** Providers an interceptor reaches through its deps; global entries skip them. */
  readonly support: Set<string>;
  /** The container finished create: the plugin's dispose hook closes the session. */
  started: boolean;
  /** No container holds the session, so a create may open a new one. */
  closed: boolean;
}

interface PluginState {
  session: ContainerSession | undefined;
}

/** Ends a session: calls through its proxies throw NOT_READY, and a create may open a new one. */
const close = (session: ContainerSession | undefined): void => {
  if (session === undefined) return;
  session.disposed = session.closed = true;
  session.instances = undefined;
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
  const GUARD = new Token<Disposable>('interceptors guard');
  const state: PluginState = { session: undefined };

  /**
   * Hands the built interceptors to the session. Core builds the registry
   * before any onInit (spec R1).
   */
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
    if (state.session !== undefined) state.session.instances = map;
    return map;
  };

  /**
   * A singleton with no deps, so core builds it in the first level. When a
   * create fails, core disposes it with the rest of the build, and the
   * session closes; the plugin's dispose hook runs only for a container
   * create returned (spec section 6).
   */
  const guard = (): Disposable => {
    const current = state.session;
    return {
      [Symbol.dispose]() {
        if (current?.started === false) close(current);
      },
    };
  };

  const module: ModuleDefinition = defineModule({
    name: 'interceptors',
    imports: config.imports,
    providers: [
      ...config.registered.map((entry) => entry.provider),
      ...config.providers,
      provide(REGISTRY, { deps: tokens, useFactory: bind } as never),
      provide(GUARD, { useFactory: guard }),
    ],
  });

  const plans = new WeakMap<ProviderView, ProviderPlan>();
  const planFor = (
    provider: ProviderView,
    current: ContainerSession,
  ): ProviderPlan => {
    let plan = plans.get(provider);
    if (plan === undefined) {
      plan = {
        global: current.support.has(provider.id) ? [] : config.global,
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
        if (view.phase === 'create') {
          // Any session no container has closed belongs to a live or
          // still-building container. Failing here, before any build,
          // leaves its ids and instances alone (spec R9).
          if (state.session?.closed === false) {
            report(shared());
            return;
          }
          state.session = {
            instances: undefined,
            disposed: false,
            moduleIds: new Set(),
            support: new Set(),
            started: false,
            closed: false,
          };
        }
        const current = state.session;
        if (current === undefined) return;
        current.moduleIds.add(own.id);
        for (const id of reach(
          view,
          view.providers.filter((p) => p.module === own.id).map((p) => p.id),
        ))
          current.support.add(id);
      },
    },
    setup() {
      if (state.session !== undefined) state.session.started = true;
    },
    dispose() {
      // Core runs this after it disposes every instance the container
      // owns, so a disposer that calls an intercepted method still runs
      // its interceptors (spec section 6).
      close(state.session);
    },
    construct(instance, provider, scope) {
      // The session of the container building: compile.check opened it,
      // and no other create can open one until this container closes it.
      const current = state.session;
      if (current === undefined || current.moduleIds.has(provider.module))
        return undefined;
      if (
        (typeof instance !== 'object' && typeof instance !== 'function') ||
        instance === null
      )
        return undefined;
      const plan = planFor(provider, current);
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
        session: current,
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
