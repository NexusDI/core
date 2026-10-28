import { REQUEST_ID, type ProviderRecord } from '../blueprint/blueprint.js';
import { DisposedError, NotReadyError } from '../errors/index.js';
import { constructionStack } from './construction-stack.js';
import { formatFor } from './format.js';
import { isObject } from './ownership.js';
import type { ContainerState, Ctx, TransientOwner } from './state.js';

/**
 * The shape of `resolveId` (runtime/build.ts). Callers pass it in, so
 * build.ts and lazy.ts do not import each other.
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
 * What a thunk call does for one target. A step holds a ready value or a
 * build with its ctx. lazyStep returns the NotReadyError for a refusal.
 */
type LazyStep =
  | { readonly value: unknown }
  | { readonly build: string; readonly ctx: Ctx }
  | NotReadyError;

/**
 * Decides what a thunk call does for `id`, and builds nothing. makeThunk and
 * makeListThunk both read the decision from here. A disposed target throws
 * NEXUS_DISPOSED. Follows alias hops with a loop, since an alias chain can be
 * arbitrarily long and one call frame per hop would overflow the call stack.
 */
function lazyStep(
  id: string,
  owner: Pick<ProviderRecord, 'name' | 'lifetime'>,
  ctx: Ctx,
): LazyStep {
  const { bp, container } = ctx;
  for (;;) {
    if (id === REQUEST_ID) return { build: id, ctx };
    const target = bp.providers.get(id);
    if (target === undefined) return { build: id, ctx };
    if (target.kind === 'alias') {
      id = bp.bindings.get(id)?.target ?? '';
      continue;
    }

    if (target.lifetime === null || target.lifetime === 'singleton') {
      const slots = container.root.slots;
      if (slots.isReady(id)) return { value: live(slots.value(id), container) };
      // A deferred singleton builds at this call, in the root: the thunk may
      // run long after the build that made it, so its own ctx is stale. Any
      // other that is not ready yet, a levelled eager: false one included,
      // is not ready here either.
      if (
        slots.has(id) ||
        !bp.deferred.has(id) ||
        constructionStack.contains(id, container.root)
      )
        return notReady(owner, target, container.root);
      return {
        build: id,
        ctx: { bp, container: container.root, owner: container.root },
      };
    }
    if (target.lifetime === 'scoped') {
      if (container.kind === 'root') return { build: id, ctx };
      if (constructionStack.contains(id, container))
        return notReady(owner, target, container);
      if (container.slots.has(id)) {
        if (!container.slots.isSettled(id))
          return notReady(owner, target, container);
        return { value: live(container.slots.value(id), container) };
      }
      // A scoped class and a deferred scoped factory build on demand (spec
      // §6.3, §6.6); a levelled scoped factory's instance always comes from
      // createScope's or extend()'s own build. An async factory's thunk call runs
      // with an empty construction stack (construction-stack.ts), so
      // `owner` must come from this closure, not from
      // constructionStack.top() as resolveScoped's own NotReadyError falls
      // back to for a caller reached synchronously.
      if (target.kind === 'factory' && !bp.deferred.has(id))
        return notReady(owner, target, container);
      return { build: id, ctx: { bp, container, owner: container } };
    }

    // A transient builds on demand, unless it is the one being built right now.
    if (constructionStack.contains(id, container))
      return notReady(owner, target, container);
    const transientOwner: TransientOwner =
      container.kind === 'scope'
        ? container
        : owner.lifetime === 'singleton'
          ? 'singleton-thunk'
          : 'root-transient';
    return { build: id, ctx: { bp, container, owner: transientOwner } };
  }
}

/** Runs a decided step. A refusal throws, and a ready value or a build returns. */
function run(step: LazyStep, resolve: ResolveId): unknown {
  if (step instanceof NotReadyError) throw step;
  return 'build' in step ? resolve(step.build, step.ctx) : step.value;
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
  return () => {
    try {
      return run(lazyStep(targetId, owner, ctx), resolve);
    } catch (error) {
      throw formatFor(ctx.container.root, error);
    }
  };
}

/**
 * The thunk a lazy(all()) dep resolves to. Each call first decides every id
 * in order and stops at the first one a lazy() thunk would refuse, building
 * nothing. That refusal is NEXUS_NOT_READY, or NEXUS_DISPOSED when the
 * contribution it meets first is disposed, so record order settles which of
 * the two a call throws. Then it resolves each id as a lazy() thunk does and
 * returns a new array. A singleton contribution gives its one instance and a
 * transient one builds per call.
 */
export function makeListThunk(
  targetIds: readonly string[],
  owner: Pick<ProviderRecord, 'name' | 'lifetime'>,
  ctx: Ctx,
  resolve: ResolveId,
): () => unknown[] {
  return () => {
    try {
      const steps: LazyStep[] = [];
      for (const id of targetIds) {
        const step = lazyStep(id, owner, ctx);
        if (step instanceof NotReadyError) throw step;
        steps.push(step);
      }
      return steps.map((step) => run(step, resolve));
    } catch (error) {
      throw formatFor(ctx.container.root, error);
    }
  };
}
