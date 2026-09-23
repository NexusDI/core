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
