/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Token class for dependency injection
 * Creates unique tokens for dependency injection with optional string identifiers
 *
 * @example
 * import { Token } from '@nexusdi/core';
 * export const MY_TOKEN = new Token('MyToken');
 * export const MY_SERVICE = new Token<MyService>();
 * export const MY_OTHER_SERVICE = new Token<IMyOtherService>();
 * @see https://nexus.js.org/docs/modules/tokens
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Token<T = any> {
  private static counter = 0;
  private readonly id: string;
  private readonly symbol: symbol;

  /**
   * Create a new Token for DI registration. Intended for user code.
   */
  constructor(identifier?: string) {
    this.id = identifier || `__token_${Token.counter++}__`;
    this.symbol = Symbol(this.id);
  }

  /**
   * Get the string identifier of this token (public API).
   */
  toString(): string {
    return this.id;
  }

  /**
   * @internal
   */
  toSymbol(): symbol {
    return this.symbol;
  }

  /**
   * @internal
   */
  equals(other: Token<any>): boolean {
    return this.symbol === other.symbol;
  }

  /**
   * @internal
   */
  static create<T>(identifier: string): Token<T> {
    return new Token<T>(identifier);
  }

  /**
   * @internal
   */
  static createUnique<T>(): Token<T> {
    return new Token<T>();
  }
}
