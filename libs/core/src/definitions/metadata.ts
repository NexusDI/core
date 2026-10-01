/**
 * The metadata declareClass and declareProperty write into
 * `C[Symbol.metadata]` and the compiler reads back.
 *
 * Standard decorators create one metadata object per decorated class, whose
 * prototype is the parent class's metadata object. A read therefore inherits
 * the parent's entry, and a write creates an own key, so a subclass never
 * changes its parent's metadata (regression R10).
 */

import type { Dep } from './modifiers.js';
import { pickOwn } from './own-keys.js';
import type { Lifetime } from './types.js';

export const INJECTABLE: unique symbol = Symbol.for('nexusdi.injectable');
export const PROPS: unique symbol = Symbol.for('nexusdi.props');

/** Holds only the keys the decorator's options set on themselves. */
export interface InjectableMetadata {
  readonly deps?: readonly unknown[] | undefined;
  /** Validated by the compiler, since JavaScript callers can write anything. */
  readonly lifetime?: unknown;
}

export interface PropMetadata {
  readonly key: string | symbol;
  readonly dep: unknown;
  readonly set: (target: object, value: unknown) => void;
}

export type MetadataRecord = Record<PropertyKey, unknown>;

const OBJECT_PROTOTYPE = Object.prototype as MetadataRecord;

/**
 * The class's own metadata object, or undefined when it has none or it is
 * Object.prototype. A getter on `C[Symbol.metadata]` runs once per call. The
 * compiler calls it once per provider entry and passes the result to
 * injectableIn and propsIn.
 */
export function metadataOf(cls: unknown): MetadataRecord | undefined {
  const key = (Symbol as { metadata?: symbol }).metadata;
  if (key === undefined || typeof cls !== 'function') return undefined;
  const value = (cls as unknown as Record<symbol, unknown>)[key];
  return typeof value === 'object' &&
    value !== null &&
    value !== OBJECT_PROTOTYPE
    ? (value as MetadataRecord)
    : undefined;
}

/** The next metadata object up the chain; undefined past its last one. */
function parentOf(metadata: MetadataRecord): MetadataRecord | undefined {
  const parent = Object.getPrototypeOf(metadata) as MetadataRecord | null;
  return parent === null || parent === OBJECT_PROTOTYPE ? undefined : parent;
}

/**
 * The nearest @Injectable entry on `metadata` and the metadata objects it
 * inherits from, stopping before Object.prototype.
 */
export function injectableIn(
  metadata: MetadataRecord | undefined,
): InjectableMetadata | undefined {
  for (let m = metadata; m !== undefined; m = parentOf(m))
    if (Object.hasOwn(m, INJECTABLE))
      return m[INJECTABLE] as InjectableMetadata;
  return undefined;
}

/**
 * Every @Inject entry on `metadata` and the metadata objects it inherits
 * from, parents first, stopping before Object.prototype.
 */
export function propsIn(metadata: MetadataRecord | undefined): PropMetadata[] {
  const levels: (readonly PropMetadata[])[] = [];
  for (let m = metadata; m !== undefined; m = parentOf(m))
    if (Object.hasOwn(m, PROPS)) levels.unshift(m[PROPS] as PropMetadata[]);
  return levels.flat();
}

/**
 * Declares a class's deps and lifetime on its decorator metadata object.
 * Only the keys `options` sets on itself are recorded (SEC-003), as own keys
 * of `metadata` (regression R10).
 */
export function declareClass(
  metadata: DecoratorMetadataObject,
  options: { readonly deps?: readonly Dep[]; readonly lifetime?: Lifetime },
): void {
  metadata[INJECTABLE] = Object.freeze(
    pickOwn(options, ['deps', 'lifetime']) as InjectableMetadata,
  );
}

/**
 * Adds a property injection to a class's decorator metadata object. The
 * container calls `access.set(instance, value)`; without `access` it assigns
 * `instance[key] = value`. A decorator passes its `context.access`.
 */
export function declareProperty(
  metadata: DecoratorMetadataObject,
  key: string | symbol,
  dep: Dep,
  access?: { set(target: object, value: unknown): void },
): void {
  if (!Object.hasOwn(metadata, PROPS)) metadata[PROPS] = [];
  (metadata[PROPS] as PropMetadata[]).push({
    key,
    dep,
    set:
      access === undefined
        ? (target, value) => {
            (target as Record<PropertyKey, unknown>)[key] = value;
          }
        : (target, value) => access.set(target, value),
  });
}
