import { ContainerException } from './container.exception';

export class InvalidService extends ContainerException {
  constructor(service: unknown) {
    super(
      `Service class ${
        typeof service === 'function' ? service.name : String(service)
      } is not decorated with @Service`
    );
  }
}
