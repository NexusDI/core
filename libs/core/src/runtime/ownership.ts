/** An instance a container disposes, with what to report about it. */
export interface OwnedEntry {
  readonly instance: object;
  readonly providerId: string;
  readonly token: string;
}

export function isObject(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

/**
 * Identity sets shared by the root and every scope.
 *
 * An object is tracked for disposal only when no container tracks it and it
 * is not a useValue. So a scope never disposes an object the root tracks, a
 * factory that returns an existing singleton adds nothing, and a factory that
 * returns a useValue object never makes it disposable (regression R07).
 * onInit uses the same identity rule.
 *
 * `claim` and `claimInit` return `boolean`, not a type predicate: a
 * predicate that reads false for an already-claimed object would narrow that
 * object to `never` in the false branch of `if (!claim(x))`. Callers narrow
 * with `isObject` at the call site instead.
 */
export class Ownership {
  readonly #tracked = new Set<object>();
  readonly #values = new WeakSet<object>();
  readonly #disposed = new WeakSet<object>();
  readonly #initialized = new WeakSet<object>();

  registerValue(value: unknown): void {
    if (isObject(value)) this.#values.add(value);
  }

  claim(value: unknown): boolean {
    if (!isObject(value) || this.#tracked.has(value) || this.#values.has(value))
      return false;
    this.#tracked.add(value);
    return true;
  }

  markDisposed(value: object): void {
    this.#tracked.delete(value);
    this.#disposed.add(value);
  }

  isDisposed(value: unknown): boolean {
    return isObject(value) && this.#disposed.has(value);
  }

  claimInit(value: unknown): boolean {
    if (
      !isObject(value) ||
      this.#values.has(value) ||
      this.#initialized.has(value)
    )
      return false;
    this.#initialized.add(value);
    return true;
  }
}
