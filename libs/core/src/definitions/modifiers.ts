import type { InjectionToken, MultiToken, Token } from './token.js';
import type { Class } from './types.js';

/** Resolves to `undefined` when no provider of the token is visible. */
export interface Optional<out T> {
  readonly kind: 'optional';
  readonly token: InjectionToken<T>;
}

/** Resolves to a thunk. The only way to express a dependency cycle. */
export interface Lazy<out T> {
  readonly kind: 'lazy';
  readonly token: InjectionToken<T>;
}

/** Resolves to every visible contribution of a MultiToken. */
export interface All<out T> {
  readonly kind: 'all';
  readonly token: MultiToken<T>;
}

export type Modifier = Optional<unknown> | Lazy<unknown> | All<unknown>;

/** One entry of a deps tuple. A bare MultiToken is not one: wrap it in all(). */
export type Dep =
  InjectionToken<unknown> | Optional<unknown> | Lazy<unknown> | All<unknown>;

/** What a deps entry resolves to. */
export type Resolve<D> =
  D extends Optional<infer T>
    ? T | undefined
    : D extends Lazy<infer T>
      ? () => T
      : D extends All<infer T>
        ? T[]
        : D extends Token<infer T>
          ? T
          : D extends Class<infer T>
            ? T
            : never;

/** A deps tuple mapped to the arguments a factory receives. */
export type ResolveAll<D extends readonly unknown[]> = {
  -readonly [K in keyof D]: Resolve<D[K]>;
};

/** The deps entries that can supply a parameter of type P. */
export type DepFor<P> =
  | InjectionToken<P>
  | (undefined extends P ? Optional<Exclude<P, undefined>> : never)
  | (P extends () => infer R ? Lazy<R> : never)
  | (P extends readonly (infer E)[] ? All<E> : never);

/** Constructor parameters mapped to the deps entries that can supply them. */
export type Tokens<P extends readonly unknown[]> = {
  readonly [K in keyof P]: DepFor<P[K]>;
};

const MODIFIERS = new WeakSet<object>();

function mark<M extends Modifier>(modifier: M): M {
  Object.freeze(modifier);
  MODIFIERS.add(modifier);
  return modifier;
}

export function optional<T>(token: InjectionToken<T>): Optional<T> {
  return mark({ kind: 'optional', token });
}

export function lazy<T>(token: InjectionToken<T>): Lazy<T> {
  return mark({ kind: 'lazy', token });
}

export function all<T>(token: MultiToken<T>): All<T> {
  return mark({ kind: 'all', token });
}

/** True for a value one of the modifier functions returned. */
export function isModifier(value: unknown): value is Modifier {
  return typeof value === 'object' && value !== null && MODIFIERS.has(value);
}

/** A record of deps entries, as resolve() and validate() take it. */
export type DepsMap = Readonly<Record<string, Dep>>;

/** A deps map or tuple mapped to what each entry resolves to. */
export type ResolvedDeps<D extends DepsMap | readonly Dep[]> = {
  -readonly [K in keyof D]: Resolve<D[K]>;
};
