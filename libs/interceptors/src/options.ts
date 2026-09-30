import {
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

import type { Fault } from './interceptor-error.js';
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

/** The entries interceptor() made: each one's registration, or its fault when its token was bad. */
const ENTRIES = new WeakMap<object, Registered | Fault>();

/** A value as an error names it, without calling its own toString. */
const shown = (value: unknown): string =>
  isForeign(value)
    ? `${displayName(value)} from another copy of @nexusdi/core`
    : displayName(value);

/** A bad interceptors() option: `detail` names the rule, then what was received. */
const bad = (...detail: string[]): Fault => ({
  code: 'NEXUS_INTERCEPTOR_INVALID',
  reason: 'options',
  detail,
});

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
      : bad('interceptor-token', shown(token));
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
      ? (fault as Fault)
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
export function parseOptions(options: unknown): NormalOptions | Fault[] {
  if (typeof options !== 'object' || options === null)
    return [bad('not-object')];
  const faults: Fault[] = [];
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
      const made = ENTRIES.get(element) as Registered | Fault;
      if ('code' in made) {
        faults.push(made);
        continue;
      }
      entry = made;
    } else {
      faults.push(bad('register-entry', shown(element)));
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
    if (typeof element !== 'object' || element === null) {
      faults.push(bad('global-entry', shown(element)));
      continue;
    }
    const use = own(element, 'use');
    const when = own(element, 'when');
    if (!isInterceptorToken(use)) faults.push(bad('global-use', shown(use)));
    else if (when !== undefined && typeof when !== 'function')
      faults.push(bad('global-when', shown(when)));
    else global.push({ use, when: when as NormalGlobal['when'] });
  }

  const bindings: NormalBinding[] = [];
  for (const element of list('bindings')) {
    if (typeof element !== 'object' || element === null) {
      faults.push(bad('binding', shown(element)));
      continue;
    }
    const token = own(element, 'token');
    if (!(token instanceof Token) && typeof token !== 'function') {
      faults.push(bad('binding-token', shown(token)));
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
    else faults.push(bad('exempt-entry', shown(element)));
  }

  const providers = list('providers') as ProviderEntry[];
  const imports = list('imports') as ModuleRef[];
  return faults.length > 0
    ? faults
    : { registered, providers, imports, global, bindings, exempt };
}
