/**
 * Text for any thrown value, for use inside an error message.
 *
 * `String(value)` throws for an object with a null prototype and for one
 * whose `toString` throws, and a message formatter that throws replaces the
 * user's error with its own.
 */
export function describeThrown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
