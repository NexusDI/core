import {
  describeValue,
  displayName,
  isForeign,
  MultiToken,
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

import type { Fault, ForeignValue } from './interceptor-error.js';
import {
  isInterceptorToken,
  own,
  parseMap,
  type ParsedMap,
} from './metadata.js';
import type {
  ExemptToken,
  GlobalTarget,
  Interceptor,
  InterceptorEntry,
  InterceptorToken,
} from './types.js';

/**
 * A problem of the options: a fault whose text interceptorsText writes, or a
 * value another copy of core made.
 */
export type OptionsProblem = Fault | ForeignValue;

/** The entries interceptor() made: each one's registration, or its problem when its token was bad. */
const ENTRIES = new WeakMap<object, Registered | OptionsProblem>();

/** A bad interceptors() option: `detail` names the rule, then what was received. */
const bad = (...detail: string[]): Fault => ({
  code: 'NEXUS_INTERCEPTOR_INVALID',
  reason: 'options',
  detail,
});

/**
 * The problem of a value that breaks `rule`: a ForeignValue when another copy
 * of core made it, and otherwise a fault that names it without calling its
 * own toString.
 */
const rejected = (
  rule: string,
  value: unknown,
  where: string,
): OptionsProblem =>
  isForeign(value)
    ? { foreign: true, received: describeValue(value), where }
    : bad(rule, displayName(value));

/**
 * The first value another copy of core made in a binding's `class` list or
 * in one of its `methods` lists, read from own keys only (SEC-013).
 */
function foreignIn(binding: object): unknown {
  const methods = own(binding, 'methods');
  const lists = [
    own(binding, 'class'),
    ...(typeof methods === 'object' && methods !== null
      ? Reflect.ownKeys(methods).map((key) => own(methods, key))
      : []),
  ];
  return lists
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .find(isForeign);
}

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
  // A bad token is a fault the plugin's compile.check reports, with the
  // graph's other errors (spec section 2.5.12).
  const fault =
    token instanceof Token || typeof token === 'function'
      ? undefined
      : rejected('interceptor-token', token, 'interceptor()');
  const provider =
    fault === undefined
      ? (provide(token as never, definition as never) as Provider<Interceptor>)
      : undefined;
  const entry: InterceptorEntry = Object.freeze({
    token: token as InterceptorToken,
    provider,
  });
  ENTRIES.set(
    entry,
    provider === undefined
      ? (fault as OptionsProblem)
      : { token: token as InterceptorToken, provider },
  );
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
  readonly exempt: readonly ExemptToken[];
}

/**
 * Validates interceptors() options from own keys only (SEC-013). Returns
 * the options, or every fault they have, for compile.check to report.
 */
export function parseOptions(
  options: unknown,
): NormalOptions | OptionsProblem[] {
  if (typeof options !== 'object' || options === null)
    return [bad('not-object')];
  const faults: OptionsProblem[] = [];
  const list = (name: string): readonly unknown[] => {
    const value = own(options, name);
    if (value === undefined) return [];
    if (Array.isArray(value)) return value;
    faults.push(bad('not-array', name));
    return [];
  };

  const register = list('register');
  // A register that is not an array has its fault already.
  if (register.length === 0 && faults.length === 0)
    faults.push(bad('register-empty'));
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
    ) {
      const made = ENTRIES.get(element) as Registered | OptionsProblem;
      if (!('provider' in made)) {
        faults.push(made);
        continue;
      }
      entry = made;
    } else {
      faults.push(
        rejected('register-entry', element, 'interceptors() register'),
      );
      continue;
    }
    if (seen.has(entry.token))
      faults.push({
        code: 'NEXUS_INTERCEPTOR_INVALID',
        reason: 'options',
        token: displayName(entry.token),
        detail: ['register-twice'],
      });
    seen.add(entry.token);
    registered.push(entry);
  }

  const global: NormalGlobal[] = [];
  for (const element of list('global')) {
    if (isInterceptorToken(element)) {
      global.push({ use: element, when: undefined });
      continue;
    }
    if (typeof element !== 'object' || element === null || isForeign(element)) {
      faults.push(rejected('global-entry', element, 'interceptors() global'));
      continue;
    }
    const use = own(element, 'use');
    const when = own(element, 'when');
    if (!isInterceptorToken(use))
      faults.push(rejected('global-use', use, 'interceptors() global'));
    else if (when !== undefined && typeof when !== 'function')
      faults.push(rejected('global-when', when, 'interceptors() global'));
    else global.push({ use, when: when as NormalGlobal['when'] });
  }

  const bindings: NormalBinding[] = [];
  for (const element of list('bindings')) {
    if (typeof element !== 'object' || element === null || isForeign(element)) {
      faults.push(rejected('binding', element, 'interceptors() bindings'));
      continue;
    }
    const token = own(element, 'token');
    if (!(token instanceof Token) && typeof token !== 'function') {
      faults.push(rejected('binding-token', token, 'interceptors() bindings'));
      continue;
    }
    const remote = foreignIn(element);
    if (remote !== undefined) {
      faults.push(rejected('binding-map', remote, 'interceptors() bindings'));
      continue;
    }
    const parsed = parseMap(element, ['token']);
    if (typeof parsed === 'string')
      faults.push({
        code: 'NEXUS_INTERCEPTOR_INVALID',
        reason: 'options',
        token: displayName(token),
        detail: ['binding-map', parsed],
      });
    else bindings.push({ token: token as InjectionToken<unknown>, ...parsed });
  }

  const exempt: ExemptToken[] = [];
  for (const element of list('exempt')) {
    if (isInterceptorToken(element) || element instanceof MultiToken)
      exempt.push(element as ExemptToken);
    else
      faults.push(rejected('exempt-entry', element, 'interceptors() exempt'));
  }

  const providers = list('providers') as ProviderEntry[];
  const imports = list('imports') as ModuleRef[];
  return faults.length > 0
    ? faults
    : { registered, providers, imports, global, bindings, exempt };
}
