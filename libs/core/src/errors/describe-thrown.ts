import { ERROR_BRAND } from './brand.js';

/** `read()`, or `fallback` when it throws. */
export function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/**
 * Text for any thrown value, for use inside an error message. A NexusError
 * gives its message alone, since its `[CODE]` prefix already names it.
 *
 * Every NexusError's one-line message calls it on its cause, so it never
 * throws. `String(value)` throws for an object with a null prototype, for
 * one whose `toString` throws and for a symbol message, and a message
 * getter or a proxy trap can throw too. A throw here would replace the
 * user's error with its own.
 */
export function describeThrown(value: unknown): string {
  return safely(
    () =>
      value instanceof Error
        ? ERROR_BRAND in value
          ? String(value.message)
          : `${value.name}: ${value.message}`
        : String(value),
    safely(() => Object.prototype.toString.call(value), '[unprintable]'),
  );
}

/** How many characters of a foreign cause a message quotes before `…`. */
const CAUSE_CHARS = 500;

/**
 * Text for a wrapped cause: describeThrown's, cut at 500 characters and
 * ended with `…` for a value that is not a NexusError. A NexusError cause
 * keeps all of its text, which core or a text pack wrote. The whole value
 * stays on `error.cause`.
 */
export function describeCause(cause: unknown): string {
  const text = describeThrown(cause);
  return text.length <= CAUSE_CHARS ||
    safely(() => cause instanceof Error && ERROR_BRAND in cause, false)
    ? text
    : `${text.slice(0, CAUSE_CHARS)}…`;
}
