import type { TokenType, ProviderConfig } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata } from '../helpers';

/**
 * Shared decorator factory for providers and services.
 * Allows for future extensibility (e.g., scopes, types).
 */
function makeProviderDecorator(
  defaults?: Partial<ProviderConfig>
): (tokenOrConfig?: TokenType<any> | ProviderConfig) => ClassDecorator {
  return (tokenOrConfig?: TokenType<any> | ProviderConfig) => (target) => {
    let config: ProviderConfig = { ...defaults };
    if (
      typeof tokenOrConfig === 'object' &&
      tokenOrConfig !== null &&
      ('scope' in tokenOrConfig ||
        'singleton' in tokenOrConfig ||
        'type' in tokenOrConfig)
    ) {
      config = { ...config, ...tokenOrConfig };
    } else if (tokenOrConfig) {
      config.token = tokenOrConfig as TokenType<any>;
    }
    if (!config.token) config.token = target as any;
    setMetadata(target, METADATA_KEYS.PROVIDER_METADATA, config);
  };
}

/**
 * Decorator that marks a class as a provider for dependency injection.
 *
 * Use this for advanced scenarios where you want to register a class under a specific token or with custom config.
 *
 * @param tokenOrConfig The custom token or config for the provider (class constructor, symbol, Token, or config object)
 * @publicApi
 */
export const Provider = makeProviderDecorator();

/**
 * Decorator that marks a class as a service for dependency injection.
 *
 * This is a specialized provider with singleton semantics and a 'service' type.
 *
 * @param tokenOrConfig Optional custom token or config for the service (class constructor, symbol, Token, or config object)
 * @publicApi
 */
export const Service = makeProviderDecorator({
  singleton: true,
  type: 'service',
});
