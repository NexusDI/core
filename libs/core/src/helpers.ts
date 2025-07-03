/* eslint-disable @typescript-eslint/no-explicit-any */

type MetadataKey = string | symbol;

/**
 * Set metadata on a target using Symbol.metadata (native decorators)
 */
export function setMetadata<T = any>(
  target: any,
  key: MetadataKey,
  value: T
): void {
  // Ensure the target has Symbol.metadata
  if (!target[Symbol.metadata]) {
    target[Symbol.metadata] = {};
  }
  target[Symbol.metadata][key] = value;
}

/**
 * Get metadata from a target using Symbol.metadata (native decorators)
 */
export function getMetadata<T = any>(
  target: any,
  key: MetadataKey
): T | undefined {
  return target[Symbol.metadata]?.[key];
}

/**
 * Get parameter types from constructor - for native decorators we need to store these manually
 * since there's no automatic type reflection
 */
export function getParameterTypes(target: any): any[] {
  return getMetadata(target, 'design:paramtypes') || [];
}

/**
 * Set parameter types on constructor - used by decorators to store type information
 */
export function setParameterTypes(target: any, types: any[]): void {
  setMetadata(target, 'design:paramtypes', types);
}
