import { brand } from './brand.js';
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

// The definition keys are `never` so a definition object fails this form
// before TypeScript checks its callbacks. TypeScript types a callback's
// parameters from the first overload whose structural check passes, and
// excess keys don't fail that check, so without these keys
// `provide(Cls, { useFactory: (a) => ..., deps })` types `a` from this
// overload, where useFactory has no type, and `a` is implicitly any.
type ClassOptionsObject<C extends Ctor> = {
  useClass?: never;
  useValue?: never;
  useExisting?: never;
  useFactory?: never;
} & LifetimeAndEager<ClassEager<C>> &
  DepsFor<C>;

export type ClassOptions<C extends Ctor> =
  DeclaresDeps<C> extends true
    ? [options?: ClassOptionsObject<C>]
    : [options: ClassOptionsObject<C>];

/**
 * deps on a useClass binding. The compiler reads C's @Injectable metadata
 * or static deps when the binding has none, and no type records metadata, so
 * deps is optional; a static deps that a type can see is still checked.
 */
export type UseClassDeps<C extends Ctor> = C extends { readonly deps: unknown }
  ? DepsFor<C>
  : { deps?: Tokens<ConstructorParameters<C>> };

/** The type eager: false on an async build must match, so the error names the rule. */
export type LazyAsyncMessage =
  'NEXUS_LAZY_ASYNC: an async provider is built during create or createScope, so it cannot be eager: false. Remove eager: false, or make the token a function type and provide () => Promise<T>';

/** eager for a class form: false is rejected on a class whose onInit returns a promise. */
export type ClassEager<C extends Ctor> =
  InstanceType<C> extends { onInit(): PromiseLike<unknown> }
    ? { eager?: true | LazyAsyncMessage }
    : { eager?: boolean };

/**
 * The lifetime and eager keys of a class or factory form. A transient takes
 * no eager. lifetime sits in the first member, so TypeScript reports a bad
 * lifetime against it first.
 */
export type LifetimeAndEager<E> =
  | ({ lifetime?: 'singleton' | 'scoped' } & E)
  | { lifetime: 'transient'; eager?: never };

/** The type a lifetime on useValue or useExisting must match, so the error names the rule. */
export type NoLifetimeMessage =
  'NEXUS_INVALID_PROVIDER: useValue and useExisting take no lifetime. Remove lifetime';

// Each member excludes the other members' definition keys. Without that,
// TypeScript reports `{ useValue, lifetime }` against the useClass member,
// which accepts a lifetime, and the NoLifetimeMessage never shows.
export type TokenDefinition<T, C extends Ctor> =
  | ({
      useClass: C;
      useValue?: never;
      useExisting?: never;
    } & LifetimeAndEager<ClassEager<C>> &
      UseClassDeps<C>)
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

/**
 * What @nexusdi/testing's override() accepts besides a factory. Its
 * useClass takes deps the way provide()'s does (UseClassDeps), so an
 * @Injectable fake needs no deps option.
 */
export type OverrideDefinition<T, C extends Ctor> =
  | ({ useClass: C; lifetime?: Lifetime } & UseClassDeps<C>)
  | { useValue: NoInfer<T>; lifetime?: never };

export type AsyncTransientMessage =
  "NEXUS_ASYNC_TRANSIENT: get() is synchronous, so a transient factory cannot be async. Use lifetime: 'scoped', or make the token a function type and provide () => Promise<T>";

export type PromiseTokenMessage =
  'NEXUS_PROMISE_TOKEN: the container awaits a factory result, so a token cannot hold a Promise. Type the token as the resolved value, or as () => Promise<T>';

export type FactoryDefinition<D extends readonly Dep[], R> = {
  useFactory: (...args: ResolveAll<D>) => R;
  deps?: D;
} & ([R] extends [PromiseLike<unknown>]
  ? | { lifetime?: 'singleton' | 'scoped'; eager?: true | LazyAsyncMessage }
    | { lifetime: AsyncTransientMessage; eager?: never }
  : LifetimeAndEager<{ eager?: boolean }>);

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
  const provider = Object.freeze(brand({})) as Provider<unknown>;
  SPECS.set(provider, { token, options });
  return provider;
}

/** The spec behind a value provide() returned, or undefined for anything else. */
export function readProvider(value: unknown): ProviderSpec | undefined {
  return typeof value === 'object' && value !== null
    ? SPECS.get(value)
    : undefined;
}
