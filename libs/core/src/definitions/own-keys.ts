/**
 * Copies the listed keys that `source` sets on itself into an object with no
 * prototype. A key that only the prototype chain supplies is left out, so a
 * polluted `Object.prototype` cannot supply one (SEC-003). Each getter runs
 * once, here.
 */
export function pickOwn<const K extends string>(
  source: object,
  keys: readonly K[],
): { readonly [P in K]?: unknown } {
  const picked: { [P in K]?: unknown } = Object.create(null);
  for (const key of keys) {
    if (Object.hasOwn(source, key))
      picked[key] = (source as Record<K, unknown>)[key];
  }
  return picked;
}
