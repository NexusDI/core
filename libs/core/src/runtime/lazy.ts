import { REQUEST_ID, type ProviderRecord } from '../blueprint/blueprint.js';
import { DisposedError, NotReadyError } from '../errors/index.js';
import { constructionStack } from './construction-stack.js';
import { isObject } from './ownership.js';
import type { ContainerState, Ctx, TransientOwner } from './state.js';

/**
 * The shape of `resolveId` (runtime/build.ts), passed in rather than
 * imported so build.ts and lazy.ts do not import each other.
 */
export type ResolveId = (id: string, ctx: Ctx) => unknown;

function notReady(
  owner: Pick<ProviderRecord, 'name' | 'lifetime'>,
  target: ProviderRecord,
  container: ContainerState,
): NotReadyError {
  const path = constructionStack.contains(target.id, container)
    ? constructionStack.cycleFrom(target.id, container)
    : [];
  return new NotReadyError({ owner: owner.name, target: target.name, path });
}

/** A thunk may reach a target during disposal, until that target itself is disposed. */
function live(value: unknown, container: ContainerState): unknown {
  if (isObject(value) && container.root.ownership.isDisposed(value))
    throw new DisposedError({ target: 'instance' });
  return value;
}

/**
 * Follows alias hops with a loop, not recursion: an alias chain can be
 * arbitrarily long, and recursing one call frame per hop would overflow the
 * call stack instead of resolving.
 */
function resolveLazy(
  id: string,
  owner: Pick<ProviderRecord, 'name' | 'lifetime'>,
  ctx: Ctx,
  resolve: ResolveId,
): unknown {
  const { bp, container } = ctx;
  for (;;) {
    if (id === REQUEST_ID) return resolve(id, ctx);
    const target = bp.providers.get(id);
    if (target === undefined) return resolve(id, ctx);
    if (target.kind === 'alias') {
      id = bp.bindings.get(id)?.target ?? '';
      continue;
    }

    if (target.lifetime === null || target.lifetime === 'singleton') {
      const slots = container.root.slots;
      if (!slots.isReady(id)) throw notReady(owner, target, container.root);
      return live(slots.value(id), container);
    }
    if (target.lifetime === 'scoped') return resolve(id, ctx);

    // A transient builds on demand, unless it is the one being built right now.
    if (constructionStack.contains(id, container))
      throw notReady(owner, target, container);
    const transientOwner: TransientOwner =
      owner.lifetime === 'singleton' ? 'singleton-thunk' : 'root-transient';
    return resolve(id, { bp, container, owner: transientOwner });
  }
}

/**
 * The thunk a lazy() dep resolves to. It resolves in the container that built
 * its owner, and each call runs a fresh lookup there. A singleton or value
 * target must be ready; see spec section 6.3.
 */
export function makeThunk(
  targetId: string,
  owner: Pick<ProviderRecord, 'name' | 'lifetime'>,
  ctx: Ctx,
  resolve: ResolveId,
): () => unknown {
  return () => resolveLazy(targetId, owner, ctx, resolve);
}
