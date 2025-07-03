/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TokenType, ProviderConfig, Constructor } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata } from '../helpers';

/**
 * Service decorator for dependency injection.
 * Works with both legacy experimental decorators and native TypeScript decorators.
 *
 * @param config - Optional configuration for the service (token, singleton, eager)
 *
 * @example
 * // Basic usage
 * @Service()
 * class UserService {}
 *
 * // Transient (non-singleton) service
 * @Service({ singleton: false })
 * class TransientService {
 *   constructor(@Inject(DatabaseService) private db: DatabaseService) {}
 * }
 *
 * // Eager singleton with custom token
 * import { Token } from '@nexusdi/core';
 * const MY_TOKEN = new Token('MyToken');
 *
 * @Service({ token: MY_TOKEN, eager: true })
 * class EagerUserService {
 *   @Inject(MY_TOKEN) value!: string;
 * }
 *
 * #### Notes
 * - `singleton` (default: true): If false, a new instance is created each time.
 * - `eager`: If true, the service is initialized immediately on container startup.
 * - `token`: Custom token for registration.
 *
 * @see https://nexus.js.org/docs/providers-and-services
 * @see https://nexus.js.org/docs/tokens
 * @see https://nexus.js.org/docs/container/decorators
 * @publicApi
 */
export function Service<T = any>(config: ProviderConfig<T> = {}) {
  return function (
    target: Constructor<T>,
    context?: ClassDecoratorContext
  ): void {
    // Set service metadata with defaults
    const serviceConfig = {
      token: config.token || target,
      singleton: config.singleton !== false,
      eager: config.eager === true,
      ...config,
    };

    setMetadata(target, METADATA_KEYS.SERVICE_METADATA, serviceConfig);

    // Also set legacy provider metadata for backward compatibility
    setMetadata(target, METADATA_KEYS.PROVIDER_METADATA, serviceConfig);
  };
}
