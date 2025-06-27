import type { TokenType, ServiceConfig } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata } from '../helpers';

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
 * @param token Optional custom token for the service (class constructor, symbol, or Token)
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @publicApi
 */
export function Service<T>(token?: TokenType<T>): ClassDecorator {
  return (target) => {
    const config: ServiceConfig<T> = {
      token: token || (target as unknown as TokenType<T>),
    };
    setMetadata(target, METADATA_KEYS.SERVICE_METADATA, config);
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
