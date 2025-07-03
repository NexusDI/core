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
 * Property injection (legacy and modern decorators):
 * ```typescript
 * class MyService {
 *   @Inject(MY_TOKEN)
 *   value!: string;
 * }
 * ```
 *
 * #### Notes
 * - Do not use on methods (will throw an error).
 * - Works with both legacy and native TypeScript decorators.
 * - See also: {@link InjectParam}
 *
 * @param token The lookup key for the provider to be injected (class constructor, symbol, or Token).
 *
 * @see https://nexus.js.org/docs/providers-and-services
 * @see https://nexus.js.org/docs/tokens
 * @see https://nexus.js.org/docs/container/decorators
 * @publicApi
 */
export function Inject<T = any>(token: TokenType<T>) {
  return function (
    target: any,
    context?:
      | ClassFieldDecoratorContext
      | ClassMethodDecoratorContext
      | string
      | symbol,
    parameterIndex?: number
  ): void {
    // Handle parameter injection (constructor parameters)
    if (typeof parameterIndex === 'number') {
      const metadataTarget =
        context === undefined ? target : target.constructor;
      const existingMetadata: InjectionMetadata[] =
        getMetadata(metadataTarget, METADATA_KEYS.INJECT_METADATA) || [];

      const injectionMetadata: InjectionMetadata = {
        token,
        propertyKey: context as string | symbol | undefined,
        index: parameterIndex,
      };

      existingMetadata.push(injectionMetadata);
      setMetadata(
        metadataTarget,
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata
      );
      return;
    }

    // Handle property injection (legacy decorator syntax)
    if (typeof context === 'string' || typeof context === 'symbol') {
      // Legacy property decorator: (target, propertyKey)
      const metadataTarget = target;
      const existingMetadata: InjectionMetadata[] =
        getMetadata(metadataTarget, METADATA_KEYS.INJECT_METADATA) || [];

      const injectionMetadata: InjectionMetadata = {
        token,
        propertyKey: context,
        index: -1, // Not applicable for properties
      };

      existingMetadata.push(injectionMetadata);
      setMetadata(
        metadataTarget,
        METADATA_KEYS.INJECT_METADATA,
        existingMetadata
      );

      return;
    }

    // Handle property injection (with modern decorator context)
    if (context && typeof context === 'object' && 'kind' in context) {
      const { kind, name } = context;

      if (kind === 'field') {
        // Property injection - target is the class prototype
        const metadataTarget = target;
        const existingMetadata: InjectionMetadata[] =
          getMetadata(metadataTarget, METADATA_KEYS.INJECT_METADATA) || [];

        const injectionMetadata: InjectionMetadata = {
          token,
          propertyKey: name as string | symbol,
          index: -1, // Not applicable for properties
        };

        existingMetadata.push(injectionMetadata);
        setMetadata(
          metadataTarget,
          METADATA_KEYS.INJECT_METADATA,
          existingMetadata
        );
      } else if (kind === 'method') {
        // Parameter injection (for constructor parameters)
        // This is handled by parameter decorators in the constructor
        throw new Error(
          '@Inject on methods is not supported. Use parameter decorators in constructor.'
        );
      }
    }
  };
}

/**
 * Parameter decorator version of Inject for constructor parameters.
 *
 * @example
 * class MyService {
 *   constructor(@InjectParam(MY_TOKEN) value: string) {}
 * }
 *
 * @see Inject
 * @see https://nexus.js.org/docs/providers-and-services
 * @see https://nexus.js.org/docs/tokens
 * @see https://nexus.js.org/docs/container/decorators
 * @publicApi
 */
export function InjectParam<T = any>(token: TokenType<T>) {
  return function (
    target: any,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ): void {
    const metadataTarget =
      propertyKey === undefined ? target : target.constructor;
    const existingMetadata: InjectionMetadata[] =
      getMetadata(metadataTarget, METADATA_KEYS.INJECT_METADATA) || [];

    const injectionMetadata: InjectionMetadata = {
      token,
      propertyKey,
      index: parameterIndex,
    };

    existingMetadata.push(injectionMetadata);
    setMetadata(
      metadataTarget,
      METADATA_KEYS.INJECT_METADATA,
      existingMetadata
    );
  };
}
