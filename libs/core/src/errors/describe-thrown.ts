import { ERROR_BRAND } from './brand.js';

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
  try {
    if (value instanceof Error)
      return ERROR_BRAND in value
        ? String(value.message)
        : `${value.name}: ${value.message}`;
    return String(value);
  } catch {
    try {
      return Object.prototype.toString.call(value);
    } catch {
      return '[unprintable]';
    }
  }
}
