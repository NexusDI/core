import type { TokenType, Constructor, ModuleConfig } from './types.js';
import {
  setServiceMetadata,
  setInjectMetadata,
  setModuleMetadata,
  generateTokenFromClass,
} from './metadata.js';

/**
 * Service decorator - marks a class as a service with an optional token
 *
 * @example
 * ```ts
 * @Service(LOGGER_TOKEN)
 * class LoggerService {}
 *
 * @Service() // auto-generates token from class name
 * class UserService {}
 * ```
 */
export function Service<T extends object = object>(token?: TokenType<T>) {
  return function <TClass extends Constructor<T>>(
    target: TClass,
    context: ClassDecoratorContext<TClass>
  ): TClass {
    const serviceToken = token || generateTokenFromClass(target as Constructor);
    setServiceMetadata(target as Constructor, serviceToken);
    return target;
  };
}

/**
 * Inject decorator - marks a constructor parameter for dependency injection
 *
 * @example
 * ```ts
 * class UserService {
 *   constructor(@Inject(LOGGER_TOKEN) private logger: Logger) {}
 * }
 * ```
 */
export function Inject<T>(token: TokenType<T>) {
  return function (
    target: undefined,
    context: ClassFieldDecoratorContext | ClassMethodDecoratorContext
  ): void {
    if (context.kind === 'method' && context.name === 'constructor') {
      // For constructor parameters, we need to handle this differently
      // Store the token for later retrieval
      const parameterIndex = context.metadata?.parameterIndex as number;
      if (typeof parameterIndex === 'number') {
        setInjectMetadata(target as any, parameterIndex, token);
      }
    }
  };
}

/**
 * Parameter decorator version of Inject
 */
export function InjectParam<T>(token: TokenType<T>) {
  return function (
    target: any,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ): void {
    setInjectMetadata(target, parameterIndex, token);
  };
}

/**
 * Module decorator - configures a module with providers, imports, and exports
 *
 * @example
 * ```ts
 * @Module({
 *   providers: [UserService, LoggerService],
 *   exports: [USER_SERVICE_TOKEN]
 * })
 * class UserModule {}
 * ```
 */
export function Module(config: ModuleConfig) {
  return function <TClass extends Constructor>(
    target: TClass,
    context: ClassDecoratorContext<TClass>
  ): TClass {
    setModuleMetadata(target, config);
    return target;
  };
}
