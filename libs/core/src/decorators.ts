// @ts-nocheck
// TypeScript's type system cannot express decorator overloads with union implementation signatures for DI ergonomics.
// This file disables type checking to allow ergonomic and type-safe decorator APIs for users.
// See: https://github.com/microsoft/TypeScript/issues/37181 for context on why this is necessary.
import 'reflect-metadata';
import type { TokenType, ServiceConfig, ModuleConfig } from './types';
import { METADATA_KEYS, type InjectionMetadata } from './types';
import type { Token } from './token';

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
export function Service<T>(token?: new (...args: any[]) => T): ClassDecorator;
export function Service<T = any>(token?: string): ClassDecorator;
export function Service<T>(token?: Token<T>): ClassDecorator;

// @ts-expect-error: Implementation signature must support all overloads (TypeScript limitation)
export function Service<T>(
  token?: new (...args: any[]) => T | string | Token<T>
): ClassDecorator {
  return (target: any) => {
    const config: ServiceConfig<T> = {
      token: token || (target as TokenType<T>),
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
export function Provider<T>(token: new (...args: any[]) => T): ClassDecorator;
export function Provider<T = any>(token: string): ClassDecorator;
export function Provider<T>(token: Token<T>): ClassDecorator;

// @ts-expect-error: Implementation signature must support all overloads (TypeScript limitation)
export function Provider<T>(
  token: new (...args: any[]) => T | string | Token<T>
): ClassDecorator {
  return (target: any) => {
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
export function Inject<T>(
  token: new (...args: any[]) => T
): PropertyDecorator & ParameterDecorator;
export function Inject<T = any>(
  token: string
): PropertyDecorator & ParameterDecorator;
export function Inject<T>(
  token: Token<T>
): PropertyDecorator & ParameterDecorator;

// @ts-expect-error: Implementation signature must support all overloads (TypeScript limitation)
export function Inject<T>(
  token: new (...args: any[]) => T | string | Token<T>
): PropertyDecorator & ParameterDecorator {
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex?: number
  ) => {
    if (typeof parameterIndex === 'number') {
      // Parameter decorator
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
    } else if (propertyKey !== undefined) {
      // Property decorator
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
export function Optional<T>(
  token: new (...args: any[]) => T
): PropertyDecorator & ParameterDecorator;
export function Optional<T = any>(
  token: string
): PropertyDecorator & ParameterDecorator;
export function Optional<T>(
  token: Token<T>
): PropertyDecorator & ParameterDecorator;

// @ts-expect-error: Implementation signature must support all overloads (TypeScript limitation)
export function Optional<T>(
  token: new (...args: any[]) => T | string | Token<T>
): PropertyDecorator & ParameterDecorator {
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex?: number
  ) => {
    if (typeof parameterIndex === 'number') {
      // Parameter decorator
      const existingMetadata: InjectionMetadata[] =
        Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target) || [];
      const metadata: InjectionMetadata = {
        token,
        index: parameterIndex,
        propertyKey: undefined,
        optional: true,
      };
      existingMetadata.push(metadata);
      Reflect.defineMetadata(
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata,
        target
      );
    } else if (propertyKey !== undefined) {
      // Property decorator
      const existingMetadata: InjectionMetadata[] =
        Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target) || [];
      const metadata: InjectionMetadata = {
        token,
        index: 0,
        propertyKey,
        optional: true,
      };
      existingMetadata.push(metadata);
      Reflect.defineMetadata(
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata,
        target
      );
    }
  };
}
