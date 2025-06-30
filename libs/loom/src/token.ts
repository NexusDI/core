/**
 * A token represents a unique identifier for a dependency in the DI container.
 * Tokens provide loose coupling between interfaces and implementations.
 *
 * @example
 * ```ts
 * const LOGGER = new Token<ILogger>('logger');
 * const DATABASE = new Token<IDatabase>('database');
 * ```
 */
export class Token<T = unknown> {
  readonly #name: string;

  constructor(name: string) {
    this.#name = name;
  }

  get name(): string {
    return this.#name;
  }

  toString(): string {
    return `Token(${this.#name})`;
  }

  valueOf(): string {
    return this.#name;
  }
}

/**
 * Type representing any token
 */
export type TokenType<T = unknown> = Token<T>;
