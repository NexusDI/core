/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TokenType, ServiceConfig, ModuleConfig } from './types';
import { METADATA_KEYS, type InjectionMetadata } from './types';

/**
 * Decorator that marks a class as a DI module, allowing you to group providers, services, and imports.
 *
 * Use this to define a module in NexusDI. Modules can import other modules, provide services, and export tokens.
 *
 * #### Usage
 * ```typescript
 * import { Module } from '@nexusdi/core';
 *
 * @Module({
 *   providers: [LoggerService],
 *   imports: [OtherModule],
 * })
 * class AppModule {}
 * ```
 *
 * @param config The module configuration (providers, imports, exports, etc.)
 *
 * @see https://nexus.js.org/docs/modules/module-basics
 * @see https://nexus.js.org/docs/modules/module-patterns
 * @publicApi
 */
export function Module(config: ModuleConfig) {
  return (target: new (...args: any[]) => any) => {
    Reflect.defineMetadata(METADATA_KEYS.MODULE_METADATA, config, target);
  };
}

/**
 * Decorator that marks a class as a service for dependency injection.
 *
 * Use this to register a class as a singleton or transient service in the DI container.
 *
 * #### Usage
 * ```typescript
 * import { Service } from '@nexusdi/core';
 *
 * @Service()
 * class LoggerService {}
 * ```
 *
 * @param token Optional custom token for the service (class, string, or Token)
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @publicApi
 */
export function Service<T>(token?: TokenType<T>) {
  return (target: new (...args: any[]) => T) => {
    const config: ServiceConfig<T> = {
      token: token || target,
    };
    Reflect.defineMetadata(METADATA_KEYS.SERVICE_METADATA, config, target);
  };
}

/**
 * Decorator that marks a class as a provider with a custom token.
 *
 * Use this for advanced scenarios where you want to register a class under a specific token.
 *
 * #### Usage
 * ```typescript
 * import { Provider, Token } from '@nexusdi/core';
 *
 * const MY_TOKEN = new Token('MyToken');
 *
 * @Provider(MY_TOKEN)
 * class MyProvider {}
 * ```
 *
 * @param token The custom token for the provider (class, string, or Token)
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @see https://nexus.js.org/docs/modules/tokens
 * @publicApi
 */
export function Provider<T>(token: TokenType<T>) {
  return (target: new (...args: any[]) => T) => {
    const config: ServiceConfig<T> = {
      token,
    };
    Reflect.defineMetadata(METADATA_KEYS.SERVICE_METADATA, config, target);
  };
}

/**
 * Decorator that marks a constructor parameter or property for dependency injection.
 *
 * Use this to inject a service, provider, or value into a class. The token can be a class, string, or a custom `Token`.
 *
 * #### Injection tokens
 * - Can be a class (type), string, or a `Token` instance.
 * - The token must match a provider registered in the current module or its imports.
 *
 * #### Usage
 * ```typescript
 * import { Inject, Token } from '@nexusdi/core';
 *
 * const MY_TOKEN = new Token('MyToken');
 *
 * class MyService {
 *   constructor(@Inject(MY_TOKEN) private value: string) {}
 * }
 * ```
 *
 * @param token The lookup key for the provider to be injected (class, string, or Token).
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @see https://nexus.js.org/docs/modules/tokens
 * @publicApi
 */
export function Inject<T>(token: TokenType<T>) {
  return (
    target: any,
    propertyKey: string | symbol,
    parameterIndex?: number
  ) => {
    if (typeof parameterIndex === 'number') {
      // Constructor parameter injection: store on the constructor
      const metadataTarget = target;
      const existingMetadata: InjectionMetadata[] =
        Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, metadataTarget) ||
        [];
      const metadata: InjectionMetadata = {
        token,
        index: parameterIndex,
        propertyKey: undefined,
      };
      existingMetadata.push(metadata);
      Reflect.defineMetadata(
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata,
        metadataTarget
      );
    } else {
      // Property injection: store on the prototype
      const metadataTarget = target;
      const existingMetadata: InjectionMetadata[] =
        Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, metadataTarget) ||
        [];
      const metadata: InjectionMetadata = {
        token,
        index: 0,
        propertyKey,
      };
      existingMetadata.push(metadata);
      Reflect.defineMetadata(
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata,
        metadataTarget
      );
    }
  };
}

/**
 * Decorator that marks a class as injectable for dependency injection.
 *
 * This is an alias for `@Service()` and is provided for compatibility and clarity.
 *
 * #### Usage
 * ```typescript
 * import { Injectable } from '@nexusdi/core';
 *
 * @Injectable()
 * class MyService {}
 * ```
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @publicApi
 */
export const Injectable = Service;

/**
 * Decorator that marks a dependency as optional for injection.
 *
 * Use this to indicate that a dependency is not required and may be undefined if not provided.
 *
 * #### Usage
 * ```typescript
 * import { Optional, Token } from '@nexusdi/core';
 *
 * const MY_TOKEN = new Token('MyToken');
 *
 * class MyService {
 *   constructor(@Optional(MY_TOKEN) private value?: string) {}
 * }
 * ```
 *
 * @param token The lookup key for the optional provider (class, string, or Token).
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @see https://nexus.js.org/docs/modules/tokens
 * @publicApi
 */
export function Optional<T>(token: TokenType<T>) {
  return (
    target: any,
    propertyKey: string | symbol,
    parameterIndex?: number
  ) => {
    const existingMetadata: InjectionMetadata[] =
      Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target) || [];
    const metadata: InjectionMetadata = {
      token,
      index: typeof parameterIndex === 'number' ? parameterIndex : 0,
      propertyKey: typeof parameterIndex === 'number' ? undefined : propertyKey,
      optional: true,
    };
    existingMetadata.push(metadata);
    Reflect.defineMetadata(
      METADATA_KEYS.INJECT_METADATA,
      existingMetadata,
      target
    );
  };
}
