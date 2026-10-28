/**
 * Orders two strings by UTF-16 code unit. `<` gives one order on every
 * engine, where `localeCompare` follows the host locale.
 */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
