/* eslint-disable @typescript-eslint/no-explicit-any */
// Type guards and validators for NexusDI public API
import type { TokenType, Provider, Constructor, IContainer } from './types.js';
import { Token } from './token.js';
import { getMetadata } from './helpers.js';
import { METADATA_KEYS, TOKEN_BRAND } from './constants.js';

/**
 * Checks if a value is a Token instance.
 *
 * `instanceof Token` is tried first, since it is the cheap common case, but
 * is not enough on its own: it fails when a bundler emits two copies of this
 * package's `token.js` into one bundle (a `Token` from copy A is not an
 * `instanceof` copy B's class). Falling back to `constructor.name ===
 * 'Token'` is not safe either, since a bundler renames a top-level class to
 * dodge a scope collision with another top-level binding of the same name.
 * The `TOKEN_BRAND` registered symbol survives both: it is looked up in the
 * process-global symbol registry, not compared by identity or by name, so
 * every copy of `Token` reads and writes the same key regardless of module
 * duplication or renaming.
 */
export function isToken<T = unknown>(token: unknown): token is Token<T> {
  return (
    token instanceof Token ||
    !!(
      token &&
      typeof token === 'object' &&
      (token as any)[TOKEN_BRAND] === true
    )
  );
}

export function isSymbol(obj: unknown): obj is symbol {
  return typeof obj === 'symbol';
}

/**
 * Checks if a value is a valid TokenType (class constructor, symbol, or Token instance).
 */
export function isTokenType<T = unknown>(
  token: unknown,
): token is TokenType<T> {
  return isConstructor(token) || isSymbol(token) || isToken(token);
}

/**
 * Checks if a value is a Provider object (has useClass, useValue, or useFactory).
 */
export function isProvider(obj: unknown): obj is Provider {
  return !!(
    obj &&
    typeof obj === 'object' &&
    ('useClass' in obj || 'useValue' in obj || 'useFactory' in obj)
  );
}

/**
 * Checks if a value is a factory provider (has useFactory).
 */
export function isFactory(obj: unknown): obj is { useFactory: () => unknown } {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof (obj as any).useFactory === 'function'
  );
}

/**
 * Returns true if the value is a class constructor (function with a prototype).
 */
export function isConstructor(obj: unknown): obj is Constructor<any> {
  return (
    typeof obj === 'function' &&
    !!obj &&
    (obj as any).prototype &&
    (obj as any).prototype.constructor === obj
  );
}

/**
 * Returns true if the value is a decorated service/provider class.
 */
export function isService(value: unknown): value is Constructor<any> {
  return (
    isConstructor(value) &&
    !!getMetadata(value, METADATA_KEYS.PROVIDER_METADATA)
  );
}

/**
 * Checks if a value is a NexusDI container (implements IContainer interface).
 */
export function isContainer(obj: unknown): obj is IContainer {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof (obj as any).get === 'function' &&
    typeof (obj as any).set === 'function' &&
    typeof (obj as any).has === 'function' &&
    typeof (obj as any).resolve === 'function'
  );
}

export function isModuleClass(obj: unknown): obj is Constructor<any> {
  return (
    isConstructor(obj) && !!getMetadata(obj, METADATA_KEYS.MODULE_METADATA)
  );
}

export function isModuleConfig(
  obj: unknown,
): obj is { providers?: any[]; imports?: any[]; exports?: any[] } {
  return (
    !!obj && typeof obj === 'object' && ('providers' in obj || 'imports' in obj)
  );
}
