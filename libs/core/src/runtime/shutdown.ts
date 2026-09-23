import { chainErrors, collectInto, disposeInReverse } from './dispose.js';
import { disposeScope } from './scope.js';
import type { RootState } from './state.js';
import { reportDisposal } from './trace.js';

/**
 * The container's only disposal path. The first call sets the disposed flag,
 * awaits every in-flight load and createScope, disposes open scopes newest
 * first, then the root's instances one at a time in reverse creation order,
 * and emits `dispose`. Neither a disposer error nor a throwing `dispose`
 * trace callback stops it; every one joins the same list and is thrown at
 * the end, chained the way DisposableStack chains them, with a rollback
 * disposer error from an in-flight load or createScope that disposal
 * aborted (see `root.abortErrors`) chained ahead of the root's own
 * disposal errors, since it ran first. A second call returns the first
 * call's promise.
 */
export function disposeRoot(root: RootState): Promise<void> {
  root.disposal ??= (async () => {
    root.disposing = true;
    const tracer = root.tracer;
    const start = tracer.now();
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
      reportDisposal(tracer, null),
    );
    errors.push(...report.errors);

    // A throwing trace callback joins errors instead of escaping here, so
    // root.disposal still settles (rejecting with the chain below) instead
    // of leaving a second asyncDispose() to start disposal over.
    collectInto(errors, () =>
      tracer.emit(() => ({
        type: 'dispose',
        disposed: report.disposed,
        errors: errors.length,
        durationMs: tracer.now() - start,
      })),
    );
    const chained = chainErrors(errors);
    if (chained !== undefined) throw chained.error;
  })();
  return root.disposal;
}
