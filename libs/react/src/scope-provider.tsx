import type { NexusRequest, Scope } from '@nexusdi/core';
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  NexusContext,
  useNexusContext,
  type NexusContextValue,
} from './context.js';
import { nestedScope } from './errors.js';
import { useHydrated } from './hydrated.js';
import { deferred, type Lease } from './release.js';
import type { Store } from './store.js';

export interface ScopeProviderProps {
  /** Read once, when the scope is created. Remount with a key for new request data. */
  request?: NexusRequest;
  fallback?: ReactNode;
  children?: ReactNode;
}

/** One ScopeProvider instance's scope: its creation, its outcome and its lease. */
interface Holder extends Lease {
  readonly store: Store;
  scope: Scope | undefined;
  error: unknown;
  failed: boolean;
  disposed: boolean;
}

/**
 * Starts the scope a ScopeProvider holds. The creation is in the store's
 * pending set until it settles and the scope is in its live set until the
 * lease disposes it, so a section load extends it (react spec 6.5).
 */
function hold(
  store: Store,
  request: NexusRequest | undefined,
  settled: () => void,
): Holder {
  const created = store.container.createScope({ request });
  store.pending.add(created);
  const lease = deferred(async () => {
    holder.disposed = true;
    const scope = await created.catch(() => undefined); // a failed create built nothing
    if (scope === undefined) return;
    store.live.delete(scope);
    await scope[Symbol.asyncDispose]();
  });
  const holder: Holder = {
    store,
    scope: undefined,
    error: undefined,
    failed: false,
    disposed: false,
    acquire: lease.acquire,
    release: lease.release,
  };
  created.then(
    (scope) => {
      store.pending.delete(created);
      if (holder.disposed) return;
      holder.scope = scope;
      store.live.add(scope);
      settled();
    },
    (error: unknown) => {
      store.pending.delete(created);
      if (holder.disposed) return;
      holder.error = error;
      holder.failed = true;
      settled();
    },
  );
  return holder;
}

export function ScopeProvider({
  request,
  fallback = null,
  children,
}: ScopeProviderProps): ReactElement {
  const outer = useNexusContext('ScopeProvider');
  const hydrated = useHydrated();
  const requestRef = useRef(request);
  const holderRef = useRef<Holder | null>(null);
  const [, settled] = useReducer((n: number) => n + 1, 0);

  // Core 0.4 scopes do not nest (react spec 6.4). On the server and during
  // hydration this renders the fallback, so an SSR scope prop never throws.
  if (hydrated && outer.scoped) throw nestedScope();

  useEffect(() => {
    if (!hydrated) return;
    let holder = holderRef.current;
    if (holder === null || holder.disposed || holder.store !== outer.store) {
      holder = hold(outer.store, requestRef.current, settled);
      holderRef.current = holder;
    }
    holder.acquire();
    const held = holder;
    return () => held.release();
  }, [hydrated, outer.store]);

  const holder = holderRef.current;
  const current = holder?.store === outer.store ? holder : null;
  const scope = current?.scope;
  const value = useMemo<NexusContextValue | null>(
    () =>
      scope === undefined
        ? null
        : {
            container: outer.container,
            resolver: scope,
            store: outer.store,
            scoped: true,
          },
    [scope, outer.container, outer.store],
  );

  if (current?.failed === true) throw current.error;
  if (!hydrated || value === null) return <>{fallback}</>;
  return <NexusContext value={value}>{children}</NexusContext>;
}
