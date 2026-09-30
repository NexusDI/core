import type { ProviderView } from '@nexusdi/core';

import { invalid, missing, notReady } from './interceptor-error.js';
import { EXCLUDED_KEYS } from './metadata.js';
import { keyName, nameOf } from './names.js';
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
 * A class: its `prototype` is read-only, which holds for every `class` and
 * built-in constructor and for no method or plain function. Calling one
 * without `new` throws, so the proxy returns it as read (spec 5.2).
 */
const isClass = (fn: object): boolean =>
  Object.getOwnPropertyDescriptor(fn, 'prototype')?.writable === false;

/**
 * The method a data property holds, on the instance or its prototype chain
 * below Object.prototype. Undefined for an accessor, a non-function, a
 * class (`constructor` included), or an Object.prototype member.
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
    return 'value' in descriptor &&
      typeof descriptor.value === 'function' &&
      !isClass(descriptor.value as object)
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
      return interceptor.intercept(context, (next) => {
        if (next !== undefined && !Array.isArray(next))
          throw invalid('bad-next', {
            token: nameOf(chain[index]),
            target: provider.name,
            method: keyName(key),
          });
        return step(index + 1, next ?? current);
      });
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
 * Own keys whose value is a function the proxy may not replace: a get trap
 * must return the actual value of a non-writable, non-configurable data
 * property, which is what Object.freeze leaves on every own method.
 */
function lockedMethods(target: object): (string | symbol)[] {
  return Reflect.ownKeys(target).filter((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    return (
      descriptor !== undefined &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      typeof descriptor.value === 'function'
    );
  });
}

/**
 * Traps that point a proxy over a shadow object at the raw instance. The
 * shadow has no own properties, so the get trap may return a wrapper for a
 * frozen method. A descriptor reads as configurable, the one invariant a
 * shadow cannot honour otherwise; the value, writability and keys are the
 * raw instance's.
 */
function shadowTraps(raw: object): ProxyHandler<object> {
  return {
    has: (_shadow, key) => Reflect.has(raw, key),
    ownKeys: () => Reflect.ownKeys(raw),
    getOwnPropertyDescriptor(_shadow, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(raw, key);
      return descriptor === undefined
        ? undefined
        : { ...descriptor, configurable: true };
    },
    defineProperty: (_shadow, key, descriptor) =>
      Reflect.defineProperty(raw, key, descriptor),
    deleteProperty: (_shadow, key) => Reflect.deleteProperty(raw, key),
  };
}

/**
 * The instance the container stores (spec 5.2, R6). Methods run with
 * `this` set to the raw instance, so private fields work and self calls are
 * not intercepted. Every method read returns one cached function per key.
 *
 * A frozen object's own methods cannot be replaced through a proxy of the
 * object itself, so such an object is proxied through a shadow with its
 * prototype. A frozen function with an intercepted own method has no such
 * route (a shadow would have to be callable with the same own keys), so it
 * fails the build: skipping its interceptors silently could skip an auth
 * check.
 */
export function interceptedProxy<T extends object>(
  target: T,
  provider: ProviderView,
  scope: string | null,
  env: ProxyEnv,
): T {
  const raw: object = target;
  const locked = lockedMethods(raw);
  const chainOf = (key: PropertyKey): readonly InterceptorToken[] =>
    EXCLUDED_KEYS.has(key) ? [] : env.chain(key as string | symbol);
  let shadow: object = raw;
  if (locked.length > 0 && typeof raw === 'function') {
    const intercepted = locked.find((key) => chainOf(key).length > 0);
    if (intercepted !== undefined)
      throw invalid('bad-target', {
        target: provider.name,
        method: keyName(intercepted),
      });
  } else if (locked.length > 0) {
    shadow = Object.create(
      Object.getPrototypeOf(raw) as object | null,
    ) as object;
  }
  const cache = new Map<PropertyKey, { source: Method; wrapper: Method }>();
  return new Proxy(shadow, {
    ...(shadow === raw ? {} : shadowTraps(raw)),
    get(_target, key) {
      const value: unknown = Reflect.get(raw, key, raw);
      if (typeof value !== 'function') return value;
      const method = value as Method;
      const cached = cache.get(key);
      if (cached !== undefined && cached.source === method)
        return cached.wrapper;
      if (findMethod(raw, key) !== method) return method;
      if (shadow === raw && locked.includes(key as string | symbol))
        return method;
      const chain = chainOf(key);
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
    set(_target, key, value) {
      cache.delete(key);
      return Reflect.set(raw, key, value, raw);
    },
  }) as T;
}
