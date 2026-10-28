/**
 * The JSON value of a request body sent as `application/json`, else
 * `undefined`. The media type is the part of `type` before any `;`, in any
 * case. Every framework entry reads its bodies through this function, so the
 * three answer the same for a malformed, empty or non-JSON body.
 */
export function readJson(
  type: string | undefined,
  text: string | undefined,
): unknown {
  const media = type?.split(';', 1)[0]?.trim().toLowerCase();
  if (media !== 'application/json' || text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The field `key` of a JSON body, or `undefined` when the body is not an
 * object or lacks the field. Every route that reads one field of its body
 * reads it through this function.
 */
export function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null
    ? Reflect.get(body, key)
    : undefined;
}
