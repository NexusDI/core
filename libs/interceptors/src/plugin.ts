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

export interface PluginState {
  /** The plugin module's ids in the containers compiled so far (spec 5.2). */
  readonly moduleIds: Set<string>;
  session: Session | undefined;
}

const NO_DECLARATIONS: Declarations = Object.freeze({
  classTokens: [],
  methods: new Map(),
  problems: [],
  any: false,
});

interface ProviderPlan {
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
  const state: PluginState = { moduleIds: new Set(), session: undefined };

  /** The live session, or a fresh one once the previous container is disposed. */
  const session = (): Session => {
    if (state.session === undefined || state.session.disposed)
      state.session = { instances: undefined, disposed: false };
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
  const planFor = (provider: ProviderView): ProviderPlan => {
    let plan = plans.get(provider);
    if (plan === undefined) {
      plan = {
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
        if (view.phase === 'create') state.moduleIds.clear();
        const own = view.modules.find(
          (m) => m.definition === module || m.replaced === module,
        );
        if (own !== undefined && view.phase !== 'check')
          state.moduleIds.add(own.id);
        void report;
      },
    },
    construct(instance, provider, scope) {
      if (state.moduleIds.has(provider.module)) return undefined;
      if (
        (typeof instance !== 'object' && typeof instance !== 'function') ||
        instance === null
      )
        return undefined;
      const plan = planFor(provider);
      if (
        config.global.length === 0 &&
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
        session: session(),
        chain: (key) => {
          let chain = plan.chains.get(key);
          if (chain === undefined) {
            chain = chainFor(
              provider,
              key,
              config.global,
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
