import { resolveModuleRef } from './define-module.js';
import { MultiToken, Token } from './token.js';
import type { Class } from './types.js';

/** Any value the container accepts as a token. */
export type AnyToken = Token<unknown> | MultiToken<unknown> | Class;

export function isModuleRef(value: unknown): boolean {
  return resolveModuleRef(value) !== undefined;
}

/**
 * True for a class, a Token or a MultiToken. An arrow function has no
 * prototype and cannot be constructed, and an @Module class is a module, so
 * neither is a token.
 */
export function isToken(value: unknown): value is AnyToken {
  if (value instanceof Token || value instanceof MultiToken) return true;
  return (
    typeof value === 'function' &&
    value.prototype !== undefined &&
    !isModuleRef(value)
  );
}
