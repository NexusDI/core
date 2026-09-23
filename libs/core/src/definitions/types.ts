/** How long an instance lives. */
export type Lifetime = 'singleton' | 'scoped' | 'transient';

/** Any class, abstract or concrete, whatever its constructor takes. */
export type Class<T = unknown> = abstract new (...args: never) => T;

/**
 * A concrete constructor. `ConstructorParameters` needs an `any` rest to
 * accept every constructor; `never` would reject all of them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctor = new (...args: any) => unknown;
