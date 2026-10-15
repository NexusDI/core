import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False on the server and during hydration, true after it, and true at once
 * in a client-only render. The server snapshot keeps the hydration render
 * equal to the server HTML (react spec 6.1).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
