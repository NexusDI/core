/**
 * The footer's ship systems list (site UX spec 13.1 and Q11). The first entry
 * is the front page's pre-flight bay, which has no feature page. Each other
 * entry links the concept page of one 0.4 feature (tech lead TL9) until the
 * feature pages of spec 6.2 exist; the move to `/features/<name>/` is a change
 * to this list alone.
 */
export interface ShipSystem {
  label: string;
  href: string;
}

export const shipSystems: readonly ShipSystem[] = [
  { label: 'Pre-flight check', href: '/#pre-flight' },
  { label: 'Extension points', href: '/multi-providers/' },
  { label: 'Lazy edges', href: '/lazy/' },
  { label: 'Scopes', href: '/scopes/' },
  { label: 'Configurable modules', href: '/configurable-modules/' },
  { label: 'HTTP adapters', href: '/hono/' },
  { label: 'Devtools', href: '/introspection/' },
  { label: 'Testing', href: '/testing/' },
];
