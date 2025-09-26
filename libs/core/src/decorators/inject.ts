/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TokenType, InjectionMetadata } from '../types';
import { METADATA_KEYS } from '../constants';
import { getMetadata, setMetadata } from '../helpers';

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
 * Constructor injection:
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
 * #### Notes
 * - Do not use on methods (will throw an error).
 * - See also: {@link InjectParam}
 *
 * @param token The lookup key for the provider to be injected (class constructor, symbol, or Token).
 *
 * @see https://nexus.js.org/docs/providers-and-services
 * @see https://nexus.js.org/docs/tokens
 * @see https://nexus.js.org/docs/container/decorators
 * @publicApi
 */
export function Inject<T = any>(token: TokenType<T>): ParameterDecorator {
  return function (target: any, _context?: any, parameterIndex?: number): void {
    // DEBUG: Log decorator execution

    if (process.env.NEXUS_DI_DEBUG) {
      console.log(
        '[NEXUS_DI_DEBUG][@Inject] token:',
        token,
        'target:',
        target?.name || target,
        'parameterIndex:',
        parameterIndex
      );
    }
    if (typeof parameterIndex !== 'number') {
      throw new Error('@Inject can only be used on constructor parameters');
    }
    const existingMetadata: InjectionMetadata[] =
      getMetadata(target, METADATA_KEYS.INJECT_METADATA) || [];

    const injectionMetadata: InjectionMetadata = {
      token,
      index: parameterIndex,
    };
    existingMetadata.push(injectionMetadata);
    setMetadata(target, METADATA_KEYS.INJECT_METADATA, existingMetadata);
  };
}
