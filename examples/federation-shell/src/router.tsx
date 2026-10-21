import { useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/** The current path. A Link changes it with no page load, so the container stays. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** An anchor that moves to `to` in place. */
export function Link({ to, children }: { to: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    window.history.pushState(null, '', to);
    for (const listener of listeners) listener();
  };
  return (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  );
}
