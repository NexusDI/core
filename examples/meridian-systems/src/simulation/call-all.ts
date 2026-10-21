/**
 * Calls every function with `arg`, so one throwing listener never keeps the
 * others from hearing. Then it rethrows the one error, or throws an
 * `AggregateError` with every error in call order.
 */
export function callAll<T>(fns: Iterable<(arg: T) => void>, arg: T): void {
  const errors: unknown[] = [];
  for (const fn of fns) {
    try {
      fn(arg);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, `${errors.length} listeners threw.`);
  }
}
