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

type MetadataRecord = Record<PropertyKey, unknown>;

function metadataOf(cls: unknown): MetadataRecord | undefined {
  const key = (Symbol as { metadata?: symbol }).metadata;
  if (key === undefined || typeof cls !== 'function') return undefined;
  const value = (cls as unknown as Record<symbol, unknown>)[key];
  return typeof value === 'object' && value !== null
    ? (value as MetadataRecord)
    : undefined;
}

/** The class's metadata objects, own first, stopping before Object.prototype. */
function* metadataChain(cls: unknown): Generator<MetadataRecord> {
  let metadata: MetadataRecord | null | undefined = metadataOf(cls);
  while (
    metadata !== null &&
    metadata !== undefined &&
    metadata !== (Object.prototype as MetadataRecord)
  ) {
    yield metadata;
    metadata = Object.getPrototypeOf(metadata) as MetadataRecord | null;
  }
}

export function readInjectable(cls: unknown): InjectableMetadata | undefined {
  for (const metadata of metadataChain(cls)) {
    if (Object.hasOwn(metadata, INJECTABLE))
      return metadata[INJECTABLE] as InjectableMetadata;
  }
  return undefined;
}

export function readProps(cls: unknown): PropMetadata[] {
  const levels: (readonly PropMetadata[])[] = [];
  for (const metadata of metadataChain(cls)) {
    if (Object.hasOwn(metadata, PROPS))
      levels.unshift(metadata[PROPS] as PropMetadata[]);
  }
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
