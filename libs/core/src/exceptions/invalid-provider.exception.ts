import { ContainerException } from './container.exception';

export class InvalidProvider extends ContainerException {
  constructor(provider: unknown) {
    super(
      `Invalid provider: ${String(
        provider
      )}. Only class constructors, symbols, or Token<T> instances are allowed as providers.`
    );
  }
}
