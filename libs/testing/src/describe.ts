import { MultiToken, Token } from '@nexusdi/core';

/*
 * Core words its own errors with these rules and exports none of them. The
 * package keeps a copy, so a value or a token reads the same in its errors
 * as in core's. Keep them in step with libs/core/src/definitions/describe.ts,
 * displayName in libs/core/src/definitions/token.ts and isForeign in
 * libs/core/src/definitions/brand.ts.
 */

/** A short description of any value, for the `received` field of an error. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return `the string ${JSON.stringify(value)}`;
    case 'number':
    case 'boolean':
    case 'bigint':
      return `the ${typeof value} ${String(value)}`;
    case 'symbol':
      return `the symbol ${String(value)}`;
    case 'function':
      return `the function ${value.name || '(anonymous)'}`;
    default:
      return Array.isArray(value) ? 'an array' : 'an object';
  }
}

/** The name an error uses for a token. */
export function displayName(token: unknown): string {
  if (token instanceof Token || token instanceof MultiToken)
    return token.description;
  if (typeof token === 'function') return token.name || '(anonymous class)';
  return describeValue(token);
}

/**
 * True when another copy of core made `value`: it carries the brand as an
 * own property and is no token of this copy. Core also knows its own
 * provide() results; the package cannot, so one of those reads true.
 */
export function isForeign(value: unknown): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value)
    return false;
  if (value instanceof Token || value instanceof MultiToken) return false;
  try {
    return (
      Object.getOwnPropertyDescriptor(value, Symbol.for('nexusdi.definition'))
        ?.value === true
    );
  } catch {
    return false;
  }
}
