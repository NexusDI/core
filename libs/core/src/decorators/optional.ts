import type { InjectionMetadata, TokenType } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata, getMetadata } from '../helpers';

/**
 * Decorator that marks a dependency as optional for injection.
 *
 * Use this to indicate that a dependency is not required and may be undefined if not provided.
 *
 * #### Usage
 * Constructor parameter:
 * ```typescript
 * class MyService {
 *   constructor(@Optional(MY_TOKEN) private value?: string) {}
 * }
 * ```
 *
 * Property injection:
 * ```typescript
 * class MyService {
 *   @Optional(MY_TOKEN)
 *   value?: string;
 * }
 * ```
 *
 * #### Notes
 * - If the dependency is not registered, the value will be `undefined`.
 * - Works with both constructor and property injection.
 *
 * @param token The lookup key for the optional provider (class constructor, symbol, or Token).
 *
 * @see https://nexus.js.org/docs/providers-and-services#optional-dependencies
 * @see https://nexus.js.org/docs/tokens
 * @see https://nexus.js.org/docs/container/decorators
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
