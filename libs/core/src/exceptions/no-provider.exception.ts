import { ContainerException } from './container.exception.js';

export class NoProvider extends ContainerException {
  constructor(token: unknown) {
    super(`No provider found for token: ${String(token)}`);
  }
}
