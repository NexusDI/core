import { chainErrors, collectInto, disposeInReverse } from './dispose.js';
import { fromUserCode } from './format.js';
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
 * Runs the dispose hook of every plugin whose setup step finished
 * (`root.pluginsStarted`), in reverse plugin order, awaiting each, and
 * collects each throw into `errors`.
 */
async function disposePlugins(
  root: RootState,
  errors: unknown[],
): Promise<void> {
  const hooks = root.plugins.dispose;
  for (let i = hooks.length - 1; i >= 0; i--) {
    const hook = hooks[i];
    if (hook === undefined || hook.index >= root.pluginsStarted) continue;
    try {
      await hook.call();
    } catch (error) {
      errors.push(fromUserCode(error));
    }
  }
}

/**
 * The container's disposal path. The first call releases every instance,
 * emits `dispose`, then runs the dispose hook of each plugin whose setup
 * step finished, in reverse plugin order, awaiting each. Neither a disposer
 * error, a throwing `dispose` trace sink nor a throwing plugin hook stops
 * it; every one joins the same list and is thrown at the end, chained the
 * way DisposableStack chains them. A second call returns the first call's promise.
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
    await disposePlugins(root, errors);
    const chained = chainErrors(errors);
    if (chained !== undefined) throw chained.error;
  })();
  return root.disposal;
}

/**
 * Closes a container that create() will not return, because plugin k's
 * setup failed: releases every instance, then runs the dispose hooks of the
 * plugins before k, with no `dispose` event. Returns the disposer errors,
 * then the plugin dispose errors. When a hook already started disposal,
 * it waits for that disposal and returns its error, if any, and starts no
 * second release. A later [Symbol.asyncDispose]() resolves.
 */
export async function abandonRoot(root: RootState): Promise<unknown[]> {
  if (root.disposal !== undefined) {
    try {
      await root.disposal;
      return [];
    } catch (error) {
      return [error];
    }
  }
  const work = (async () => {
    const { errors } = await releaseInstances(root);
    await disposePlugins(root, errors);
    return errors;
  })();
  root.disposal = work.then(ignore, ignore);
  return work;
}
