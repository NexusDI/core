// Type guards and validators for NexusDI public API
import type { TokenType, Provider, IContainer } from './types';
import { Token } from './token';

/**
 * Checks if a value is a Token instance.
 */
export function isToken<T = unknown>(token: any): token is Token<T> {
  return !!(
    token &&
    typeof token === 'object' &&
    token.constructor &&
    token.constructor.name === 'Token'
  );
}

/**
 * Checks if a value is a valid TokenType (class constructor, symbol, or Token instance).
 */
export function isTokenType<T = unknown>(token: any): token is TokenType<T> {
  return (
    typeof token === 'function' || typeof token === 'symbol' || isToken(token)
  );
}

/**
 * Checks if a value is a Provider object (has useClass, useValue, or useFactory).
 */
export function isProvider(obj: any): obj is Provider {
  return !!(
    obj &&
    typeof obj === 'object' &&
    ('useClass' in obj || 'useValue' in obj || 'useFactory' in obj)
  );
}

/**
 * Checks if a value is a factory provider (has useFactory).
 */
export function isFactory(obj: any): obj is { useFactory: () => unknown } {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof obj.useFactory === 'function'
  );
}

/**
 * Checks if a value is a service class (has a constructor, a non-empty name, and a prototype object).
 */
export function isService(obj: any): obj is new (...args: any[]) => any {
  return (
    typeof obj === 'function' &&
    !!obj.name &&
    obj.prototype &&
    typeof obj.prototype === 'object'
  );
}

/**
 * Checks if a value is a NexusDI container (implements IContainer interface).
 */
export function isContainer(obj: any): obj is IContainer {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof obj.get === 'function' &&
    typeof obj.set === 'function' &&
    typeof obj.has === 'function' &&
    typeof obj.resolve === 'function'
  );
}
