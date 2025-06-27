import type { InjectionMetadata, TokenType } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata, getMetadata } from '../helpers';

/**
 * Decorator that marks a constructor parameter or property for dependency injection.
 *
 * Use this to inject a service, provider, or value into a class. The token can be a class constructor, symbol, or a custom `Token`.
 *
 * #### Injection tokens
 * - Can be a class constructor, symbol, or a `Token` instance.
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
 * @param token The lookup key for the provider to be injected (class constructor, symbol, or Token).
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @see https://nexus.js.org/docs/modules/tokens
 * @publicApi
 */
export function Inject<T>(
  token: TokenType<T>
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
        getMetadata(metadataTarget, METADATA_KEYS.INJECT_METADATA) || [];
      const metadata: InjectionMetadata = {
        token,
        index: parameterIndex,
        propertyKey: undefined,
      };
      existingMetadata.push(metadata);
      setMetadata(
        metadataTarget,
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata
      );
    } else if (propertyKey !== undefined) {
      // Property decorator
      const metadataTarget = target;
      const existingMetadata: InjectionMetadata[] =
        getMetadata(metadataTarget, METADATA_KEYS.INJECT_METADATA) || [];
      const metadata: InjectionMetadata = {
        token,
        index: 0,
        propertyKey,
      };
      existingMetadata.push(metadata);
      setMetadata(
        metadataTarget,
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata
      );
    }
  };
}
