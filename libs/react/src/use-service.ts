import {
  MultiToken,
  type InjectionToken,
  type LookupOptions,
  type Nexus,
} from '@nexusdi/core';

import { useNexusContext } from './context.js';
import { checkTransient } from './plugin.js';

/**
 * Returns the service a token resolves to from the nearest provider's
 * resolver: the scope of a `ScopeProvider` or a server render, or the root
 * container. A `MultiToken` returns an array that stays the same object while
 * its contents do.
 */
export function useService<T>(
  token: MultiToken<T>,
  options?: LookupOptions,
): readonly T[];
export function useService<T>(
  token: InjectionToken<T>,
  options?: LookupOptions,
): T;
export function useService(
  token: InjectionToken<unknown> | MultiToken<unknown>,
  options?: LookupOptions,
): unknown {
  const { container, resolver, store } = useNexusContext('useService');
  checkTransient(container, token, options); // before get(): a rejected token builds nothing
  if (token instanceof MultiToken)
    return store.memo(
      resolver,
      token,
      options?.module,
      resolver.get(token, options),
    );
  return resolver.get(token, options);
}

/** The root container, also under a ScopeProvider, for load() and createScope() in effects. */
export function useContainer(): Nexus {
  return useNexusContext('useContainer').container;
}
