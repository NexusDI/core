import type { Nexus, Scope } from '@nexusdi/core';
import { createContext, useContext } from 'react';

import { noProvider } from './errors.js';
import type { Store } from './store.js';

export interface NexusContextValue {
  readonly container: Nexus;
  /** The scope from a ScopeProvider or the SSR `scope` prop, else the container. */
  readonly resolver: Nexus | Scope;
  readonly store: Store;
  /** True when `resolver` is a scope. */
  readonly scoped: boolean;
}

export const NexusContext = createContext<NexusContextValue | null>(null);

export function useNexusContext(hook: string): NexusContextValue {
  const value = useContext(NexusContext);
  if (value === null) throw noProvider(hook);
  return value;
}
