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
 * or the settled value or reason of a returned thenable. Returns or rethrows
 * the original, so a sync method stays sync and an async one stays async.
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
