import type { Dep, ResolveAll, Tokens } from './modifiers.js';
import type { InjectionToken, MultiToken } from './token.js';
import type { Ctor, Lifetime } from './types.js';

declare const PROVIDER: unique symbol;

/** The opaque value provide() returns. Modules accept it in `providers`. */
export interface Provider<out T> {
  readonly [PROVIDER]: T;
}

/** deps is optional only for a parameterless class. */
export type DepsFor<C extends Ctor> =
  ConstructorParameters<C> extends []
    ? { deps?: readonly [] }
    : { deps: Tokens<ConstructorParameters<C>> };

export type ClassOptions<C extends Ctor> =
  ConstructorParameters<C> extends []
    ? [options?: { lifetime?: Lifetime } & DepsFor<C>]
    : [options: { lifetime?: Lifetime } & DepsFor<C>];

// `lifetime?: never` on the value and alias forms: union excess-property
// checking accepts a key that any member declares, so without it
// `{ useValue, lifetime }` type-checks against the useClass member's key.
export type TokenDefinition<T, C extends Ctor> =
  | ({ useClass: C; lifetime?: Lifetime } & DepsFor<C>)
  | { useValue: NoInfer<T>; lifetime?: never }
  | { useExisting: InjectionToken<NoInfer<T>>; lifetime?: never };

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
  deps: D;
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
  const D extends readonly Dep[],
  R extends NoInfer<T> | PromiseLike<NoInfer<T>>,
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
