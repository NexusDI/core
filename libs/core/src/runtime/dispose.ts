import '../polyfill/symbol-dispose.js';

import { isObject } from './ownership.js';
import type { OwnedEntry, Ownership } from './ownership.js';

/**
 * Stands in for SuppressedError where the runtime has none (Node 22). It has
 * the same `error` and `suppressed` fields. The runtime never writes a global.
 */
export class NexusSuppressedError extends Error {
  readonly error: unknown;
  readonly suppressed: unknown;

  constructor(error: unknown, suppressed: unknown, message: string) {
    super(message);
    this.name = 'SuppressedError';
    this.error = error;
    this.suppressed = suppressed;
  }
}

type SuppressedErrorClass = new (
  error: unknown,
  suppressed: unknown,
  message?: string,
) => Error;

const MESSAGE = 'An error was suppressed during disposal.';

export function suppress(error: unknown, suppressed: unknown): Error {
  const Native = (globalThis as { SuppressedError?: SuppressedErrorClass })
    .SuppressedError;
  return Native === undefined
    ? new NexusSuppressedError(error, suppressed, MESSAGE)
    : new Native(error, suppressed, MESSAGE);
}

/**
 * Folds disposal errors the way DisposableStack does: each new error becomes
 * the `error` of a SuppressedError whose `suppressed` is the chain so far.
 * The wrapper object keeps a thrown `undefined` distinguishable from no error.
 */
export function chainErrors(
  errors: readonly unknown[],
): { readonly error: unknown } | undefined {
  if (errors.length === 0) return undefined;
  let chained: unknown = errors[0];
  for (const next of errors.slice(1)) chained = suppress(next, chained);
  return { error: chained };
}

/**
 * Runs `fn` and, if it throws, pushes the error onto `errors` instead of
 * letting it propagate. `disposeInReverse` uses it per entry so a throwing
 * `onDisposed` callback never stops the rest of disposal (Task 26 ruling);
 * scope and root disposal use it the same way around their own trace
 * `emit` call, so a throwing trace callback never stops disposal there
 * either. When `fn` builds a trace event from the errors collected so far
 * and then emits it, that event's `errors` count can never include the
 * emit's own throw: the event is built before the sink runs.
 */
export function collectInto(errors: unknown[], fn: () => void): void {
  try {
    fn();
  } catch (error) {
    errors.push(error);
  }
}

interface MaybeDisposable {
  readonly [Symbol.asyncDispose]?: unknown;
  readonly [Symbol.dispose]?: unknown;
}

export function hasDisposer(value: unknown): boolean {
  if (!isObject(value)) return false;
  const candidate = value as MaybeDisposable;
  return (
    typeof candidate[Symbol.asyncDispose] === 'function' ||
    typeof candidate[Symbol.dispose] === 'function'
  );
}

/**
 * Awaits `Symbol.asyncDispose` when the object has one, and otherwise calls
 * `Symbol.dispose`. Returns whether it found a disposer.
 */
export async function disposeObject(value: object): Promise<boolean> {
  const candidate = value as MaybeDisposable;
  const asyncDispose = candidate[Symbol.asyncDispose];
  if (typeof asyncDispose === 'function') {
    await asyncDispose.call(value);
    return true;
  }
  const dispose = candidate[Symbol.dispose];
  if (typeof dispose === 'function') {
    dispose.call(value);
    return true;
  }
  return false;
}

export interface DisposeReport {
  readonly disposed: number;
  readonly errors: unknown[];
}

/**
 * Disposes the entries one at a time, last first, and empties the list. A
 * throwing disposer does not stop the rest, and neither does a throwing
 * `onDisposed`: its error joins the disposer errors instead, so a trace
 * callback error still lets every remaining entry dispose. `onDisposed`
 * hears about each entry whose disposer ran, in disposal order.
 */
export async function disposeInReverse(
  entries: OwnedEntry[],
  ownership: Ownership,
  onDisposed?: (entry: OwnedEntry) => void,
): Promise<DisposeReport> {
  const errors: unknown[] = [];
  let disposed = 0;
  for (let entry = entries.pop(); entry !== undefined; entry = entries.pop()) {
    let ran: boolean;
    try {
      ran = await disposeObject(entry.instance);
    } catch (error) {
      ran = true;
      errors.push(error);
    }
    ownership.markDisposed(entry.instance);
    if (ran) {
      disposed++;
      if (onDisposed !== undefined) {
        const disposedEntry = entry;
        collectInto(errors, () => onDisposed(disposedEntry));
      }
    }
  }
  return { disposed, errors };
}
