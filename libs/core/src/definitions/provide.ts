import type { Dep, ResolveAll, Tokens } from './modifiers.js';
import type { InjectionToken, MultiToken } from './token.js';
import type { Ctor, Lifetime } from './types.js';

declare const PROVIDER: unique symbol;

/** The opaque value provide() returns. Modules accept it in `providers`. */
export interface Provider<out T> {
  readonly [PROVIDER]: T;
}

/** True when a class needs no deps option: it takes no parameters, or its static deps supply them. */
export type DeclaresDeps<C extends Ctor> =
  ConstructorParameters<C> extends []
    ? true
    : C extends { readonly deps: Tokens<ConstructorParameters<C>> }
      ? true
      : false;

/** deps is optional for a class that declares its deps or takes no parameters. */
export type DepsFor<C extends Ctor> =
  DeclaresDeps<C> extends true
    ? { deps?: Tokens<ConstructorParameters<C>> }
    : { deps: Tokens<ConstructorParameters<C>> };

export type ClassOptions<C extends Ctor> =
  DeclaresDeps<C> extends true
    ? [options?: { lifetime?: Lifetime } & DepsFor<C>]
    : [options: { lifetime?: Lifetime } & DepsFor<C>];

/**
 * deps on a useClass binding. The compiler reads C's @Injectable metadata
 * or static deps when the binding has none, and no type records metadata, so
 * deps is optional; a static deps that a type can see is still checked.
 */
export type UseClassDeps<C extends Ctor> = C extends { readonly deps: unknown }
  ? DepsFor<C>
  : { deps?: Tokens<ConstructorParameters<C>> };

/** The type a lifetime on useValue or useExisting must match, so the error names the rule. */
export type NoLifetimeMessage =
  'NEXUS_INVALID_PROVIDER: useValue and useExisting take no lifetime. Remove lifetime';

// Each member excludes the other members' definition keys. Without that,
// TypeScript reports `{ useValue, lifetime }` against the useClass member,
// which accepts a lifetime, and the NoLifetimeMessage never shows.
export type TokenDefinition<T, C extends Ctor> =
  | ({
      useClass: C;
      lifetime?: Lifetime;
      useValue?: never;
      useExisting?: never;
    } & UseClassDeps<C>)
  | {
      useValue: NoInfer<T>;
      lifetime?: NoLifetimeMessage;
      useClass?: never;
      useExisting?: never;
    }
  | {
      useExisting: InjectionToken<NoInfer<T>>;
      lifetime?: NoLifetimeMessage;
      useClass?: never;
      useValue?: never;
    };

/** What createTestingContainer().override() accepts besides a factory. */
export type OverrideDefinition<T, C extends Ctor> =
  | ({ useClass: C; lifetime?: Lifetime } & DepsFor<C>)
  | { useValue: NoInfer<T>; lifetime?: never };

export type AsyncTransientMessage =
  "NEXUS_ASYNC_TRANSIENT: get() is synchronous, so a transient factory cannot be async. Use lifetime: 'scoped', or make the token a function type and provide () => Promise<T>";

export type PromiseTokenMessage =
  'NEXUS_PROMISE_TOKEN: the container awaits a factory result, so a token cannot hold a Promise. Type the token as the resolved value, or as () => Promise<T>';

export type FactoryDefinition<D extends readonly Dep[], R> = {
  useFactory: (...args: ResolveAll<D>) => R;
  deps?: D;
  lifetime?: [R] extends [PromiseLike<unknown>]
    ? 'singleton' | 'scoped' | AsyncTransientMessage
    : Lifetime;
};

/** What provide() recorded. The compiler validates it (pass 1). */
export interface ProviderSpec {
  readonly token: unknown;
  readonly options: unknown;
}

const SPECS = new WeakMap<object, ProviderSpec>();

/** 1. A class as its own token. */
export function provide<C extends Ctor>(
  cls: C,
  ...options: ClassOptions<C>
): Provider<InstanceType<C>>;
/** 2. A token with a class, a value or an alias. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches Ctor: a class constraint needs an `any` rest
export function provide<T, C extends new (...args: any) => NoInfer<T>>(
  token: InjectionToken<T> | MultiToken<T>,
  options: TokenDefinition<T, C>,
): Provider<T>;
/** 3. A token with a factory. */
export function provide<
  T,
  R extends NoInfer<T> | PromiseLike<NoInfer<T>>,
  const D extends readonly Dep[] = [],
>(
  token: [T] extends [PromiseLike<unknown>]
    ? PromiseTokenMessage
    : InjectionToken<T> | MultiToken<T>,
  options: FactoryDefinition<D, R>,
): Provider<T>;
export function provide(token: unknown, options?: unknown): Provider<unknown> {
  const provider = Object.freeze({}) as Provider<unknown>;
  SPECS.set(provider, { token, options });
  return provider;
}

/** The spec behind a value provide() returned, or undefined for anything else. */
export function readProvider(value: unknown): ProviderSpec | undefined {
  return typeof value === 'object' && value !== null
    ? SPECS.get(value)
    : undefined;
}
