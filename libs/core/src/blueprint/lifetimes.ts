import { LifetimeError, type NexusError } from '../errors/index.js';
import type { ProviderRecord } from './blueprint.js';

/**
 * The first path from `start` to a scoped provider, walking through
 * transients and aliases only. A singleton or a value ends a branch: a
 * singleton was checked on its own, and a value has no deps.
 */
function scopedPath(
  start: string,
  providers: ReadonlyMap<string, ProviderRecord>,
  successors: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const visited = new Set<string>([start]);
  const walk = (id: string, path: readonly string[]): string[] | null => {
    for (const next of successors.get(id) ?? []) {
      const record = providers.get(next);
      if (record === undefined) continue;
      if (record.lifetime === 'scoped') return [...path, next];
      const passes = record.lifetime === 'transient' || record.kind === 'alias';
      if (passes && !visited.has(next)) {
        visited.add(next);
        const found = walk(next, [...path, next]);
        if (found !== null) return found;
      }
    }
    return null;
  };
  return walk(start, [start]);
}

/**
 * Pass 5. A singleton outlives every scope, so it may not reach a scoped
 * provider or REQUEST through any edge, lazy ones included.
 */
export function checkLifetimes(
  providers: ReadonlyMap<string, ProviderRecord>,
  successors: ReadonlyMap<string, readonly string[]>,
  errors: NexusError[],
): void {
  for (const record of providers.values()) {
    if (record.lifetime !== 'singleton') continue;
    const path = scopedPath(record.id, providers, successors);
    if (path === null) continue;
    errors.push(
      new LifetimeError({
        path: path.map((id) => providers.get(id)?.name ?? id),
        lifetimes: path.map((id) => providers.get(id)?.lifetime ?? null),
      }),
    );
  }
}
