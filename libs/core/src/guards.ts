/* eslint-disable @typescript-eslint/no-explicit-any */
// Type guards and validators for NexusDI public API
import type { TokenType, Provider, IContainer } from './types';
import { Token } from './token';

/**
 * Checks if a value is a Token instance.
 */
export function isToken<T = unknown>(token: unknown): token is Token<T> {
  return !!(
    token &&
    typeof token === 'object' &&
    (token as any).constructor &&
    (token as any).constructor.name === 'Token'
  );
}

/**
 * Checks if a value is a valid TokenType (class constructor, symbol, or Token instance).
 */
export function isTokenType<T = unknown>(
  token: unknown
): token is TokenType<T> {
  return (
    typeof token === 'function' || typeof token === 'symbol' || isToken(token)
  );
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
 * Checks if a value is a service class (has a constructor, a non-empty name, and a prototype object).
 */
export function isService(obj: unknown): obj is new (...args: any[]) => any {
  return (
    typeof obj === 'function' &&
    !!(obj as any).name &&
    (obj as any).prototype &&
    typeof (obj as any).prototype === 'object'
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
