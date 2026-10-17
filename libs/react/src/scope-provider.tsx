import type { NexusRequest, Scope } from '@nexusdi/core';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
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

/** The props of `ScopeProvider`: the request the scope's `REQUEST` resolves to, read once, and the fallback rendered until the scope is ready. */
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

/**
 * Keeps the holder a ScopeProvider instance started, between the effect runs
 * that StrictMode and a store change cause. Only effects touch it. The
 * render reads the holder from state, which `settled` sets once the scope's
 * creation has an outcome.
 */
function createSlot() {
  let holder: Holder | null = null;
  return {
    /** The live holder for `store`, started if there is none. Call from an effect. */
    adopt(
      store: Store,
      request: NexusRequest | undefined,
      settled: (settledHolder: Holder) => void,
    ): Holder {
      if (holder === null || holder.disposed || holder.store !== store) {
        // A holder replaced by a store change may still settle after its
        // successor did. Only the holder in the slot reports.
        const started: Holder = hold(store, request, () => {
          if (holder === started) settled(started);
        });
        holder = started;
      }
      return holder;
    },
  };
}

/**
 * Gives its subtree a scope of its own, created after it mounts in the
 * browser and disposed on unmount. On the server and during hydration it
 * renders `fallback`.
 */
export function ScopeProvider({
  request,
  fallback = null,
  children,
}: ScopeProviderProps): ReactElement {
  const outer = useNexusContext('ScopeProvider');
  const hydrated = useHydrated();
  const requestRef = useRef(request);
  const [slot] = useState(createSlot);
  const [held, setHeld] = useState<Holder | null>(null);

  // Core 0.4 scopes do not nest (react spec 6.4). On the server and during
  // hydration this renders the fallback, so an SSR scope prop never throws.
  if (hydrated && outer.scoped) throw nestedScope();

  useEffect(() => {
    if (!hydrated) return;
    const holder = slot.adopt(outer.store, requestRef.current, setHeld);
    holder.acquire();
    return () => holder.release();
  }, [hydrated, outer.store, slot]);

  const current =
    held !== null && held.store === outer.store && !held.disposed ? held : null;
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
