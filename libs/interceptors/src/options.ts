import {
  provide,
  Token,
  type Dep,
  type FactoryDefinition,
  type InjectionToken,
  type ModuleRef,
  type OverrideDefinition,
  type Provider,
  type ProviderEntry,
} from '@nexusdi/core';

import { invalid } from './interceptor-error.js';
import { isInterceptorToken, parseMap, type ParsedMap } from './metadata.js';
import { nameOf } from './names.js';
import type {
  GlobalTarget,
  Interceptor,
  InterceptorEntry,
  InterceptorToken,
} from './types.js';

const ENTRIES = new WeakSet<object>();

const bad = (text: string) => invalid('options', {}, `interceptors(): ${text}`);

/** Binds an interceptor to an interface token, typed like provide(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the class constraint provide() uses
export function interceptor<C extends new (...args: any) => Interceptor>(
  token: InterceptorToken,
  definition: OverrideDefinition<Interceptor, C>,
): InterceptorEntry;
export function interceptor<
  const D extends readonly Dep[],
  R extends Interceptor | PromiseLike<Interceptor>,
>(
  token: InterceptorToken,
  definition: FactoryDefinition<D, R>,
): InterceptorEntry;
export function interceptor(
  token: unknown,
  definition: unknown,
): InterceptorEntry {
  if (!(token instanceof Token) && typeof token !== 'function')
    throw bad(
      `interceptor() needs a Token or a class, and received ${String(token)}.`,
    );
  const entry: InterceptorEntry = Object.freeze({
    token: token as InterceptorToken,
    provider: provide(
      token as never,
      definition as never,
    ) as Provider<Interceptor>,
  });
  ENTRIES.add(entry);
  return entry;
}

export interface Registered {
  readonly token: InterceptorToken;
  readonly provider: ProviderEntry;
}

export interface NormalGlobal {
  readonly use: InterceptorToken;
  readonly when: ((target: GlobalTarget) => boolean) | undefined;
}

export interface NormalBinding extends ParsedMap {
  readonly token: InjectionToken<unknown>;
}

export interface NormalOptions {
  readonly registered: readonly Registered[];
  readonly providers: readonly ProviderEntry[];
  readonly imports: readonly ModuleRef[];
  readonly global: readonly NormalGlobal[];
  readonly bindings: readonly NormalBinding[];
}

const own = (value: object, key: string): unknown =>
  Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

const list = (value: unknown, name: string): readonly unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw bad(`${name} must be an array.`);
  return value;
};

/** Validates interceptors() options from own keys only (SEC-013). */
export function normalizeOptions(options: unknown): NormalOptions {
  if (typeof options !== 'object' || options === null)
    throw bad('options must be an object.');

  const register = list(own(options, 'register'), 'register');
  if (register.length === 0)
    throw bad('register must list at least one interceptor.');
  const registered: Registered[] = [];
  const seen = new Set<unknown>();
  for (const element of register) {
    let entry: Registered;
    if (typeof element === 'function')
      entry = {
        token: element as InterceptorToken,
        provider: element as ProviderEntry,
      };
    else if (
      typeof element === 'object' &&
      element !== null &&
      ENTRIES.has(element)
    )
      entry = element as InterceptorEntry;
    else
      throw bad(
        `register takes classes and interceptor() entries, and received ${String(element)}.`,
      );
    if (seen.has(entry.token))
      throw bad(`${nameOf(entry.token)} is registered twice.`);
    seen.add(entry.token);
    registered.push(entry);
  }

  const global = list(own(options, 'global'), 'global').map(
    (element): NormalGlobal => {
      if (isInterceptorToken(element)) return { use: element, when: undefined };
      if (typeof element !== 'object' || element === null)
        throw bad('a global entry is a token or { use, when }.');
      const use = own(element, 'use');
      const when = own(element, 'when');
      if (!isInterceptorToken(use))
        throw bad('a global entry needs a token in use.');
      if (when !== undefined && typeof when !== 'function')
        throw bad("a global entry's when must be a function.");
      return { use, when: when as NormalGlobal['when'] };
    },
  );

  const bindings = list(own(options, 'bindings'), 'bindings').map(
    (element): NormalBinding => {
      if (typeof element !== 'object' || element === null)
        throw bad('a binding is { token, class?, methods? }.');
      const token = own(element, 'token');
      if (!(token instanceof Token) && typeof token !== 'function')
        throw bad('a binding needs a Token or a class in token.');
      const parsed = parseMap(element);
      if (parsed === undefined)
        throw bad(
          `the binding for ${nameOf(token)} has a malformed class or methods list.`,
        );
      return { token: token as InjectionToken<unknown>, ...parsed };
    },
  );

  return {
    registered,
    providers: list(own(options, 'providers'), 'providers') as ProviderEntry[],
    imports: list(own(options, 'imports'), 'imports') as ModuleRef[],
    global,
    bindings,
  };
}
