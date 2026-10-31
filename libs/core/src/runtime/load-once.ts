import type { ModuleRef } from '../definitions/define-module.js';
import type { Nexus } from './nexus.js';

const loaders = new WeakMap<Nexus, Nexus['load']>();

/**
 * Returns the container's load function with one cache: `(module, options?)`
 * calls `container.load` once per module and imported set, and every later
 * call with the same pair gets the same promise. The set ignores order and
 * duplicates, and compares modules by identity. A load that rejects leaves
 * the cache, so the next call tries again.
 *
 * Two calls with one container return the same function. An adapter calls it
 * on the container it serves, so concurrent requests that enter a section
 * share one load. Core decides what a repeat load with other load imports does.
 */
export function loadOnce(container: Nexus): Nexus['load'] {
  let load = loaders.get(container);
  if (load === undefined) {
    load = create(container);
    loaders.set(container, load);
  }
  return load;
}

function create(container: Nexus): Nexus['load'] {
  const byModule = new Map<ModuleRef, Map<string, Promise<void>>>();
  const ids = new Map<ModuleRef, number>();
  const idOf = (ref: ModuleRef): number => {
    let id = ids.get(ref);
    if (id === undefined) {
      id = ids.size;
      ids.set(ref, id);
    }
    return id;
  };
  return (module, options) => {
    const key = [...new Set((options?.imports ?? []).map(idOf))]
      .sort((a, b) => a - b)
      .join(',');
    let loads = byModule.get(module);
    if (loads === undefined) {
      loads = new Map();
      byModule.set(module, loads);
    }
    const known = loads.get(key);
    if (known !== undefined) return known;
    const pending = container.load(module, options);
    loads.set(key, pending);
    const forget = loads;
    pending.catch(() => {
      if (forget.get(key) === pending) forget.delete(key);
    });
    return pending;
  };
}
