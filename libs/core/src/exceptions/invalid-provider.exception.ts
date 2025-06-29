import { ContainerException } from './container.exception';

export class InvalidProvider extends ContainerException {
  constructor(provider: unknown = 'Invalid provider type') {
    super(`Invalid provider: ${String(provider)}.`);
  }
}
