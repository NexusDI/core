import { Constructor } from './types/general';

export class Token<T> {
  constructor(public readonly name: string) {}

  static fromClass<T>(cls: Constructor<T>): Token<T> {
    return new Token(cls.name);
  }
}

export type TokenType<T> = Token<T> | Constructor<T>;
