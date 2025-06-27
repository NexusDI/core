import { ContainerException } from './container.exception';

export class InvalidModule extends ContainerException {
  constructor(module: unknown) {
    super(
      `Module ${
        typeof module === 'function' ? module.name : String(module)
      } is not properly decorated with @Module`
    );
  }
}
