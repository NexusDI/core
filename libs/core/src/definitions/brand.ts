/**
 * Every copy of core writes this on the definitions it makes. It never
 * decides acceptance (that is the WeakMaps' job, SEC-003). Core reads it to
 * name a value in an error and to raise NEXUS_CORE_NOT_SHARED for a value
 * another copy made. Core writes no global.
 */
export const DEFINITION_BRAND: unique symbol = Symbol.for(
  'nexusdi.definition',
) as never;

/**
 * The brand's value in this copy. Each copy writes its own frozen object, so
 * a Proxy around this copy's value reads OWN through to the target and counts
 * as this copy's. A copy from 0.4.0-rc.0 or rc.1 writes `true`, which is not
 * OWN.
 */
const OWN: object = Object.freeze({});

/**
 * Writes the brand on `value` as an own non-enumerable property, and returns
 * it. An @Module class belongs to the user, who may freeze it or put it
 * behind a Proxy (SEC-005, SEC-006). Such a class stays unbranded, and core
 * reports an error about it with the code it raises for a value this copy
 * made.
 */
export function brand<T extends object>(value: T): T {
  try {
    Reflect.defineProperty(value, DEFINITION_BRAND, { value: OWN });
  } catch {
    // A Proxy's defineProperty trap threw; the value keeps no brand.
  }
  return value;
}

/**
 * True when another copy of core made `value`: it carries the brand as an
 * own property, and the brand's value is not this copy's OWN. A Token this
 * copy made, listed where a provider belongs, reads false. An inherited brand
 * does not count, so a subclass of a branded class reads false. A Proxy whose
 * trap throws reads false, so building an error never throws.
 */
export function isForeign(value: unknown): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value)
    return false;
  try {
    const own = Object.getOwnPropertyDescriptor(value, DEFINITION_BRAND);
    return own !== undefined && own.value !== OWN;
  } catch {
    return false;
  }
}
