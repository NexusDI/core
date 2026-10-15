import {
  MultiToken,
  type InjectionToken,
  type LookupOptions,
  type Nexus,
} from '@nexusdi/core';

import { useNexusContext } from './context.js';

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
  const { resolver, store } = useNexusContext('useService');
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
