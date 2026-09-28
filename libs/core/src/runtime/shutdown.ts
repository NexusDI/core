import { chainErrors, collectInto, disposeInReverse } from './dispose.js';
import { disposeScope } from './scope.js';
import type { RootState } from './state.js';
import { reportDisposal } from './trace.js';

const ignore = (): void => undefined;

/**
 * Sets the disposed flag, awaits every in-flight load and createScope,
 * disposes open scopes newest first, then the root's instances one at a
 * time in reverse creation order. Returns every error, the rollback errors
 * of an aborted load or createScope (`root.abortErrors`) first, since they
 * ran first.
 */
async function releaseInstances(
  root: RootState,
): Promise<{ readonly errors: unknown[]; readonly disposed: number }> {
  root.disposing = true;
  await Promise.allSettled([...root.inflight]);

  const errors: unknown[] = [...root.abortErrors];
  for (const scope of [...root.scopes].reverse()) {
    try {
      await disposeScope(scope);
    } catch (error) {
      errors.push(error);
    }
  }
  const report = await disposeInReverse(
    root.owned,
    root.ownership,
    reportDisposal(root.tracer, null),
  );
  errors.push(...report.errors);
  return { errors, disposed: report.disposed };
}

/**
 * The container's disposal path. The first call releases every instance,
 * emits `dispose`, then runs each plugin's dispose hook in reverse plugin
 * order, awaiting each. Neither a disposer error, a throwing `dispose`
 * trace sink nor a throwing plugin hook stops it; every one joins the same
 * list and is thrown at the end, chained the way DisposableStack chains
 * them. A second call returns the first call's promise.
 */
export function disposeRoot(root: RootState): Promise<void> {
  root.disposal ??= (async () => {
    const tracer = root.tracer;
    const start = tracer.now();
    const { errors, disposed } = await releaseInstances(root);

    // A throwing trace sink joins errors instead of escaping here, so
    // root.disposal still settles (rejecting with the chain below) instead
    // of leaving a second asyncDispose() to start disposal over.
    collectInto(errors, () =>
      tracer.emit(() => ({
        type: 'dispose',
        disposed,
        errors: errors.length,
        durationMs: tracer.now() - start,
      })),
    );
    const hooks = root.plugins.dispose;
    for (let i = hooks.length - 1; i >= 0; i--) {
      try {
        await hooks[i]?.call();
      } catch (error) {
        errors.push(error);
      }
    }
    const chained = chainErrors(errors);
    if (chained !== undefined) throw chained.error;
  })();
  return root.disposal;
}

/**
 * Closes a container that create() will not return, because a setup hook
 * threw: releases every instance, as a failed build does, with no `dispose`
 * event and no plugin dispose hook. A later [Symbol.asyncDispose]() on a
 * reference a hook kept resolves. Returns the disposer errors.
 */
export async function abandonRoot(root: RootState): Promise<unknown[]> {
  const release = releaseInstances(root);
  root.disposal = release.then(ignore, ignore);
  return (await release).errors;
}
