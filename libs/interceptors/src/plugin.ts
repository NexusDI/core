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
import { checkBlueprint } from './check.js';
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
}

interface PluginState {
  session: ContainerSession | undefined;
}

const newSession = (): ContainerSession => ({
  instances: undefined,
  disposed: false,
  moduleIds: new Set(),
  support: new Set(),
});

/**
 * The providers of the plugin's module and every provider they reach
 * through a dependency edge, transitively. An interceptor calls these
 * itself, so a global entry on them would recurse into the interceptor.
 */
function supportOf(view: BlueprintView, moduleId: string): string[] {
  const found = new Set(
    view.providers.filter((p) => p.module === moduleId).map((p) => p.id),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const edge of view.edges)
      if (found.has(edge.from) && !found.has(edge.to)) {
        found.add(edge.to);
        grew = true;
      }
  }
  return [...found];
}

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
  const REGISTRY = new Token<Disposable>('interceptors registry');
  const state: PluginState = { session: undefined };

  /** The live session; compile.check opens one for each create. */
  const session = (): ContainerSession => {
    if (state.session === undefined || state.session.disposed)
      state.session = newSession();
    return state.session;
  };

  const bind = (...instances: unknown[]): Disposable => {
    const current = session();
    if (current.instances !== undefined) throw shared();
    const map = new Map<unknown, Interceptor>();
    instances.forEach((instance, index) => {
      const token = tokens[index];
      if (
        (typeof instance !== 'object' && typeof instance !== 'function') ||
        instance === null ||
        typeof (instance as { intercept?: unknown }).intercept !== 'function'
      )
        throw invalid(
          'no-intercept',
          { token: nameOf(token) },
          `the interceptor ${nameOf(token)} has no intercept(call, next) method.`,
        );
      map.set(token, instance as Interceptor);
    });
    current.instances = map;
    return {
      [Symbol.dispose]() {
        current.disposed = true;
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
        checkBlueprint(view, report, config, own?.id);
        if (view.phase === 'check') return;
        const live = state.session;
        if (view.phase === 'create') {
          // A bound, undisposed session belongs to a container that is still
          // alive. Failing here, before any build, leaves its ids alone.
          if (
            live !== undefined &&
            !live.disposed &&
            live.instances !== undefined
          ) {
            report(shared());
            return;
          }
          state.session = newSession();
        }
        const current = session();
        if (own === undefined) return;
        current.moduleIds.add(own.id);
        for (const id of supportOf(view, own.id)) current.support.add(id);
      },
    },
    construct(instance, provider, scope) {
      const current = session();
      if (current.moduleIds.has(provider.module)) return undefined;
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
            throw invalid(
              'unknown-method',
              { target: provider.name, method: keyName(key) },
              `a binding for ${provider.name} names ${keyName(key)}, which is not a method of the instance.`,
            );
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
