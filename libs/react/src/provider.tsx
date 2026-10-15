import type { Nexus, Scope } from '@nexusdi/core';
import {
  use,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from 'react';

import { NexusContext, type NexusContextValue } from './context.js';
import { useHydrated } from './hydrated.js';
import { deferred, type Lease } from './release.js';
import { storeFor } from './store.js';

export interface NexusProviderProps {
  container: Nexus | Promise<Nexus> | null;
  /** The request scope during SSR (react spec 9.1). */
  scope?: Scope;
  /** Dispose each container this provider stops rendering. Default false. */
  dispose?: boolean;
  /** Render fallback on the server and during hydration (react spec 9.2). */
  clientOnly?: boolean;
  fallback?: ReactNode;
  children?: ReactNode;
}

const leases = new WeakMap<Nexus, Lease>();

function leaseFor(container: Nexus): Lease {
  let lease = leases.get(container);
  if (lease === undefined) {
    lease = deferred(() => container[Symbol.asyncDispose]());
    leases.set(container, lease);
  }
  return lease;
}

function isPromise(value: Nexus | Promise<Nexus>): value is Promise<Nexus> {
  return typeof (value as { then?: unknown }).then === 'function';
}

export function NexusProvider({
  container,
  scope,
  dispose = false,
  clientOnly = false,
  fallback = null,
  children,
}: NexusProviderProps): ReactElement {
  const hydrated = useHydrated();
  const waiting = container === null || (clientOnly && !hydrated);
  // use() may run conditionally; it suspends to the nearest Suspense.
  const ship = waiting
    ? null
    : isPromise(container)
      ? use(container)
      : container;

  const value = useMemo<NexusContextValue | null>(
    () =>
      ship === null
        ? null
        : {
            container: ship,
            resolver: scope ?? ship,
            store: storeFor(ship),
            scoped: scope !== undefined,
          },
    [ship, scope],
  );

  useEffect(() => {
    if (!dispose || ship === null) return;
    const lease = leaseFor(ship);
    lease.acquire();
    return () => lease.release();
  }, [dispose, ship]);

  if (value === null) return <>{fallback}</>;
  return <NexusContext value={value}>{children}</NexusContext>;
}
