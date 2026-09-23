import type { Dep, ResolveAll, Tokens } from './modifiers.js';
import type {
  AsyncTransientMessage,
  DepsFor,
  NoLifetimeMessage,
  PromiseTokenMessage,
  Provider,
  UseClassDeps,
} from './provide.js';
import type { InjectionToken, MultiToken, Token } from './token.js';
import type { Class, Ctor, Lifetime } from './types.js';

/** Any value `token` accepts: a class, a Token or a MultiToken. */
type AnyToken = Token<unknown> | MultiToken<unknown> | Class;

/** What a provider of the token supplies: a Token's T, a MultiToken's element, a class's instance. */
type Provided<K> =
  K extends Token<infer T>
    ? T
    : K extends MultiToken<infer T>
      ? T
      : K extends Class<infer T>
        ? T
        : never;

/**
 * A provider entry written as an object (spec §3.2). This is its widened
 * type; `defineModule` checks each literal element with `ProviderEntries`.
 */
export interface ProviderLiteral {
  readonly token: AnyToken;
  readonly deps?: readonly Dep[];
  readonly lifetime?: Lifetime;
  readonly useClass?: Ctor;
  readonly useValue?: unknown;
  readonly useFactory?: (...args: never) => unknown;
  readonly useExisting?: InjectionToken<unknown>;
}

export type UntypedFunctionMessage =
  'A provider literal cannot type a function from its deps. Annotate the parameters, or use provide()';

type IsPromise<K> = [Provided<K>] extends [PromiseLike<unknown>] ? true : false;

type FactoryLifetime<E> = E extends {
  useFactory: (...args: never) => infer R;
}
  ? [R] extends [PromiseLike<unknown>]
    ? 'singleton' | 'scoped' | AsyncTransientMessage
    : Lifetime
  : Lifetime;

/** The rules provide() enforces (spec §4.3), restated for one literal element. */
type CheckedLiteral<E> = E extends { token: infer K extends AnyToken }
  ? E extends { useValue: unknown }
    ? {
        token: K;
        useValue: NoInfer<Provided<K>>;
        lifetime?: NoLifetimeMessage;
      }
    : E extends { useExisting: unknown }
      ? {
          token: K;
          useExisting: InjectionToken<NoInfer<Provided<K>>>;
          lifetime?: NoLifetimeMessage;
        }
      : E extends { useFactory: unknown }
        ? {
            token: IsPromise<K> extends true ? PromiseTokenMessage : K;
            // deps defaults to [], so a factory without deps takes no arguments.
            useFactory: (
              ...args: E extends { deps: infer D extends readonly Dep[] }
                ? ResolveAll<D>
                : []
            ) => NoInfer<Provided<K>> | PromiseLike<NoInfer<Provided<K>>>;
            deps?: readonly Dep[];
            lifetime?: FactoryLifetime<E>;
          }
        : E extends { useClass: infer C extends Ctor }
          ? {
              token: K;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches Ctor: a class constraint needs an `any` rest
              useClass: C & (new (...args: any) => NoInfer<Provided<K>>);
              lifetime?: Lifetime;
            } & UseClassDeps<C>
          : K extends Ctor
            ? { token: K; lifetime?: Lifetime } & DepsFor<K>
            : { token: K; useValue: NoInfer<Provided<K>> }
  : { token: AnyToken };

/**
 * The check for an element TypeScript could not infer. TypeScript leaves an
 * element unknown when it holds a function whose parameters need a
 * contextual type, because the element's own inferred type would have to
 * supply that context (spec §4.6).
 */
interface UntypedLiteral {
  readonly token: AnyToken;
  readonly deps?: readonly Dep[];
  readonly lifetime?: Lifetime;
  readonly useFactory?: UntypedFunctionMessage;
  readonly useValue?: UntypedFunctionMessage;
}

/** A bare class with a static deps must list a token for each constructor parameter. */
type CheckedClass<E> = E extends Ctor & { readonly deps: unknown }
  ? { readonly deps: Tokens<ConstructorParameters<E>> }
  : E;

/**
 * One element's check. The conditional distributes over a union element, so
 * a widened `ProviderEntry[]` passes as itself: its elements can only be
 * checked at runtime.
 */
type CheckedEntry<E> =
  E extends Provider<unknown>
    ? E
    : E extends Class
      ? CheckedClass<E>
      : unknown extends E
        ? UntypedLiteral
        : ProviderLiteral extends E
          ? E
          : CheckedLiteral<E>;

/**
 * Each element of a `providers` tuple, checked with the rules provide()
 * enforces. A homomorphic mapped type lets TypeScript infer the tuple through
 * it and report an error on the element that breaks a rule.
 */
export type ProviderEntries<P extends readonly unknown[]> = {
  [I in keyof P]: CheckedEntry<P[I]>;
};
