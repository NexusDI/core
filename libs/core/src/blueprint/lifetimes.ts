import { LifetimeError, type NexusError } from '../errors/index.js';
import type { ProviderRecord } from './blueprint.js';

/**
 * The first path from `start` to a scoped provider, walking through
 * transients and aliases only, as an explicit stack rather than recursion: a
 * captive-dependency chain can be arbitrarily long, and recursing one call
 * frame per hop would let it overflow the call stack, surfacing a RangeError
 * instead of an aggregated BlueprintError. A singleton or a value ends a
 * branch: a singleton was checked on its own, and a value has no deps.
 *
 * `stack` doubles as the in-progress path: each pushed frame is one hop from
 * `start`, and a frame is popped only once every one of its successors has
 * been tried, so `stack.map((f) => f.node)` is always the chain from `start`
 * to the frame on top.
 */
function scopedPath(
  start: string,
  providers: ReadonlyMap<string, ProviderRecord>,
  successors: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const visited = new Set<string>([start]);
  const stack: { node: string; next: number }[] = [{ node: start, next: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const out = successors.get(frame.node) ?? [];
    if (frame.next >= out.length) {
      stack.pop();
      continue;
    }
    const next = out[frame.next];
    frame.next++;
    const record = providers.get(next);
    if (record === undefined) continue;
    if (record.lifetime === 'scoped')
      return [...stack.map((f) => f.node), next];
    const passes = record.lifetime === 'transient' || record.kind === 'alias';
    if (passes && !visited.has(next)) {
      visited.add(next);
      stack.push({ node: next, next: 0 });
    }
  }
  return null;
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
