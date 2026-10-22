/** `a`, `a and b` or `a, b and c`, and '' for an empty list. */
export function listInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
