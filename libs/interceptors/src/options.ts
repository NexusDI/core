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
import {
  isInterceptorToken,
  own,
  parseMap,
  type ParsedMap,
} from './metadata.js';
import { nameOf } from './names.js';
import type {
  GlobalTarget,
  Interceptor,
  InterceptorEntry,
  InterceptorToken,
} from './types.js';

const ENTRIES = new WeakSet<object>();

/** A bad interceptors() option: `detail` names the rule, then what was received. */
const bad = (...detail: string[]) => invalid('options', { detail });

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
    throw bad('interceptor-token', String(token));
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
  readonly exempt: readonly InjectionToken<unknown>[];
}

const list = (value: unknown, name: string): readonly unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw bad('not-array', name);
  return value;
};

/** Validates interceptors() options from own keys only (SEC-013). */
export function normalizeOptions(options: unknown): NormalOptions {
  if (typeof options !== 'object' || options === null) throw bad('not-object');

  const register = list(own(options, 'register'), 'register');
  if (register.length === 0) throw bad('register-empty');
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
    else throw bad('register-entry', String(element));
    if (seen.has(entry.token))
      throw invalid('options', {
        token: nameOf(entry.token),
        detail: ['register-twice'],
      });
    seen.add(entry.token);
    registered.push(entry);
  }

  const global = list(own(options, 'global'), 'global').map(
    (element): NormalGlobal => {
      if (isInterceptorToken(element)) return { use: element, when: undefined };
      if (typeof element !== 'object' || element === null)
        throw bad('global-entry', String(element));
      const use = own(element, 'use');
      const when = own(element, 'when');
      if (!isInterceptorToken(use)) throw bad('global-use', String(use));
      if (when !== undefined && typeof when !== 'function')
        throw bad('global-when', String(when));
      return { use, when: when as NormalGlobal['when'] };
    },
  );

  const bindings = list(own(options, 'bindings'), 'bindings').map(
    (element): NormalBinding => {
      if (typeof element !== 'object' || element === null)
        throw bad('binding', String(element));
      const token = own(element, 'token');
      if (!(token instanceof Token) && typeof token !== 'function')
        throw bad('binding-token', String(token));
      const parsed = parseMap(element, ['token']);
      if (typeof parsed === 'string')
        throw invalid('options', {
          token: nameOf(token),
          detail: ['binding-map', parsed],
        });
      return { token: token as InjectionToken<unknown>, ...parsed };
    },
  );

  return {
    registered,
    providers: list(own(options, 'providers'), 'providers') as ProviderEntry[],
    imports: list(own(options, 'imports'), 'imports') as ModuleRef[],
    global,
    bindings,
    exempt: list(own(options, 'exempt'), 'exempt').map((element) => {
      if (!isInterceptorToken(element))
        throw bad('exempt-entry', String(element));
      return element as InjectionToken<unknown>;
    }),
  };
}
