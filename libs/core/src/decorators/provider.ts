import type { ServiceConfig, TokenType } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata } from '../helpers';

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
 * @param token The custom token for the provider (class constructor, symbol, or Token)
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @see https://nexus.js.org/docs/modules/tokens
 * @publicApi
 */
export function Provider<T>(token: TokenType<T>): ClassDecorator {
  return (target) => {
    const config: ServiceConfig<T> = {
      token,
    };
    setMetadata(target, METADATA_KEYS.SERVICE_METADATA, config);
  };
}
