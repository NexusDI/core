/**
 * Every copy of core writes this on the definitions it makes. It never
 * decides acceptance (that is the WeakMaps' job, SEC-003); it only tells an
 * error that a rejected value came from another copy. Core writes no global.
 */
export const DEFINITION_BRAND: unique symbol = Symbol.for(
  'nexusdi.definition',
) as never;

/** The values this copy branded. A branded value outside it came from another copy. */
const MINE = new WeakSet<object>();

/**
 * Writes the brand on `value` as an own non-enumerable property, and returns
 * it. An @Module class belongs to the user, who may freeze it or put it
 * behind a Proxy (SEC-005, SEC-006); such a class stays unbranded, and an
 * error about it reads otherCopy false.
 */
export function brand<T extends object>(value: T): T {
  MINE.add(value);
  try {
    Reflect.defineProperty(value, DEFINITION_BRAND, { value: true });
  } catch {
    // A Proxy's defineProperty trap threw; the value keeps no brand.
  }
  return value;
}

/**
 * True when another copy of core made `value`: it carries the brand as an
 * own property, whatever its value, and this copy did not write it. A Token this copy made,
 * listed where a provider belongs, reads false. An inherited brand does not
 * count, so a subclass of a branded class reads false. A Proxy whose trap
 * throws reads false, so building an error never throws.
 */
export function isForeign(value: unknown): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value)
    return false;
  if (MINE.has(value)) return false;
  try {
    return (
      Object.getOwnPropertyDescriptor(value, DEFINITION_BRAND) !== undefined
    );
  } catch {
    return false;
  }
}
