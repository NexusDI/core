import { ContainerException } from './container.exception';

export class InvalidToken extends ContainerException {
  constructor(token: unknown) {
    super(
      `Invalid token: ${String(
        token
      )}. Only class constructors, symbols, or Token<T> instances are allowed as tokens.`
    );
  }
}
