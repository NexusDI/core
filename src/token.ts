/**
 * Token class for dependency injection
 * Creates unique tokens for dependency injection with optional string identifiers
 */
export class Token<T = any> {
  private static counter = 0;
  private readonly id: string;
  private readonly symbol: symbol;

  constructor(identifier?: string) {
    this.id = identifier || `__token_${Token.counter++}__`;
    this.symbol = Symbol(this.id);
  }

  /**
   * Get the string identifier of this token
   */
  toString(): string {
    return this.id;
  }

  /**
   * Get the symbol representation of this token
   */
  toSymbol(): symbol {
    return this.symbol;
  }

  /**
   * Check if this token equals another token
   */
  equals(other: Token<any>): boolean {
    return this.symbol === other.symbol;
  }

  /**
   * Create a token with a string identifier
   */
  static create<T>(identifier: string): Token<T> {
    return new Token<T>(identifier);
  }

  /**
   * Create a token with an auto-generated identifier
   */
  static createUnique<T>(): Token<T> {
    return new Token<T>();
  }
} 