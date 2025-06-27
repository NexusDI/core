import type { InjectionMetadata, TokenType } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata, getMetadata } from '../helpers';

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
 * @param token The lookup key for the optional provider (class constructor, symbol, or Token).
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 * @see https://nexus.js.org/docs/modules/tokens
 * @publicApi
 */
export function Optional<T>(
  token: TokenType<T>
): PropertyDecorator & ParameterDecorator {
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex?: number
  ) => {
    if (typeof parameterIndex === 'number') {
      // Parameter decorator
      const existingMetadata: InjectionMetadata[] =
        getMetadata(target, METADATA_KEYS.INJECT_METADATA) || [];
      const metadata: InjectionMetadata = {
        token,
        index: parameterIndex,
        propertyKey: undefined,
        optional: true,
      };
      existingMetadata.push(metadata);
      setMetadata(target, METADATA_KEYS.INJECT_METADATA, existingMetadata);
    } else if (propertyKey !== undefined) {
      // Property decorator
      const existingMetadata: InjectionMetadata[] =
        getMetadata(target, METADATA_KEYS.INJECT_METADATA) || [];
      const metadata: InjectionMetadata = {
        token,
        index: 0,
        propertyKey,
        optional: true,
      };
      existingMetadata.push(metadata);
      setMetadata(target, METADATA_KEYS.INJECT_METADATA, existingMetadata);
    }
  };
}
