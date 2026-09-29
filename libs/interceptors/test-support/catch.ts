import { isNexusError, type NexusError } from '@nexusdi/core';

/** The value `fn` throws. Fails the test when it returns. */
export function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw, and it returned');
}

/** The reason `promise` rejects with. Fails the test when it resolves. */
export async function rejected(
  promise: PromiseLike<unknown>,
): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject, and it resolved');
}

/**
 * The first NexusError with `code` in `error`, its `cause` chain, and a
 * BlueprintError's `errors`.
 */
export function findCode(error: unknown, code: string): NexusError | undefined {
  const queue: unknown[] = [error];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!isNexusError(next)) continue;
    if (next.code === code) return next;
    queue.push(next.cause);
    const inner = (next as { errors?: unknown }).errors;
    if (Array.isArray(inner)) queue.push(...inner);
  }
  return undefined;
}
