import type { ProviderView } from '@nexusdi/core';

import { missing, notReady } from './interceptor-error.js';
import { EXCLUDED_KEYS } from './metadata.js';
import { keyName } from './names.js';
import type { CallContext, Interceptor, InterceptorToken } from './types.js';

/** A method as the proxy reads it off an instance. */
export type Method = (...args: never[]) => unknown;

/**
 * One container's view of the registered interceptors. `instances` is set
 * when the registry is built; `disposed` when the registry is disposed.
 */
export interface Session {
  instances: ReadonlyMap<unknown, Interceptor> | undefined;
  disposed: boolean;
}

export interface ProxyEnv {
  readonly session: Session;
  /** The chain for a method; empty means the method is not intercepted. */
  chain(key: string | symbol): readonly InterceptorToken[];
}

/**
 * The function a data property holds, on the instance or its prototype
 * chain below Object.prototype. Undefined for an accessor, a non-function,
 * or an Object.prototype member.
 */
export function findMethod(
  target: object,
  key: PropertyKey,
): Method | undefined {
  for (
    let owner: object | null = target;
    owner !== null && owner !== Object.prototype;
    owner = Object.getPrototypeOf(owner) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor === undefined) continue;
    return 'value' in descriptor && typeof descriptor.value === 'function'
      ? (descriptor.value as Method)
      : undefined;
  }
  return undefined;
}

const isAsyncFunction = (fn: Method): boolean =>
  Object.prototype.toString.call(fn) === '[object AsyncFunction]';

const invoke = (
  method: Method,
  target: object,
  args: readonly unknown[],
): unknown => Reflect.apply(method, target, args as never[]);

function wrap(
  method: Method,
  target: object,
  key: string | symbol,
  chain: readonly InterceptorToken[],
  provider: ProviderView,
  scope: string | null,
  session: Session,
): Method {
  const async = isAsyncFunction(method);
  let resolvedFor: ReadonlyMap<unknown, Interceptor> | undefined;
  let resolved: readonly Interceptor[] = [];

  const call = (args: readonly unknown[]): unknown => {
    const instances = session.instances;
    if (session.disposed)
      throw notReady(provider.name, keyName(key), 'disposed');
    if (instances === undefined)
      throw notReady(provider.name, keyName(key), 'building');
    if (resolvedFor !== instances) {
      resolved = chain.map((token) => {
        const found = instances.get(token);
        if (found === undefined)
          throw missing(token, provider.name, keyName(key));
        return found;
      });
      resolvedFor = instances;
    }
    const step = (index: number, current: readonly unknown[]): unknown => {
      const interceptor = resolved[index];
      if (interceptor === undefined) return invoke(method, target, current);
      const context: CallContext = Object.freeze({
        instance: target,
        provider,
        method: key,
        args: Object.freeze([...current]),
        async,
        scope,
      });
      return interceptor.intercept(context, (next) =>
        step(index + 1, next ?? current),
      );
    };
    return step(0, args);
  };

  return function intercepted(...args: unknown[]): unknown {
    if (!async) return call(args);
    try {
      return call(args);
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

/**
 * The instance the container stores (spec 5.2, R6). Methods run with
 * `this` set to the raw instance, so private fields work and self calls are
 * not intercepted. Every method read returns one cached function per key.
 */
export function interceptedProxy<T extends object>(
  target: T,
  provider: ProviderView,
  scope: string | null,
  env: ProxyEnv,
): T {
  const cache = new Map<PropertyKey, { source: Method; wrapper: Method }>();
  return new Proxy(target, {
    get(raw, key) {
      const value: unknown = Reflect.get(raw, key, raw);
      if (typeof value !== 'function') return value;
      const method = value as Method;
      const cached = cache.get(key);
      if (cached !== undefined && cached.source === method)
        return cached.wrapper;
      if (findMethod(raw, key) !== method) return method;
      const chain = EXCLUDED_KEYS.has(key)
        ? []
        : env.chain(key as string | symbol);
      const wrapper: Method =
        chain.length === 0
          ? function bound(...args: unknown[]): unknown {
              return invoke(method, raw, args);
            }
          : wrap(
              method,
              raw,
              key as string | symbol,
              chain,
              provider,
              scope,
              env.session,
            );
      cache.set(key, { source: method, wrapper });
      return wrapper;
    },
    set(raw, key, value) {
      cache.delete(key);
      return Reflect.set(raw, key, value, raw);
    },
  });
}
