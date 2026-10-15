/**
 * What `tap()` reports to: `value` with the call's result, `error` with what
 * it threw or rejected with. Either may be left out.
 */
export interface TapObserver {
  value?(value: unknown): void;
  error?(error: unknown): void;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

/**
 * Runs `run` and reports its outcome: the value or failure of a sync call,
 * or the settled value or reason of a returned thenable. A sync call's value
 * is returned and its error rethrown, so a sync method stays sync. A returned
 * thenable comes back as a new promise that settles the same way, so an
 * async method stays async. An observer that throws replaces the outcome with
 * its own error.
 */
export function tap<R>(run: () => R, observer: TapObserver): R {
  let result: R;
  try {
    result = run();
  } catch (error) {
    observer.error?.(error);
    throw error;
  }
  if (!isThenable(result)) {
    observer.value?.(result);
    return result;
  }
  return result.then(
    (value) => {
      observer.value?.(value);
      return value;
    },
    (error: unknown) => {
      observer.error?.(error);
      throw error;
    },
  ) as R;
}
