/* eslint-disable @typescript-eslint/no-explicit-any */
// Type guards and validators for NexusDI public API
import type {
  TokenType,
  Constructor,
  Provider,
  IContainer,
  FactoryProvider,
  ClassProvider,
  ValueProvider,
} from './types';
import { Token } from './token';
import { getMetadata } from './helpers';
import { METADATA_KEYS } from './constants';

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

export function isSymbol(obj: unknown): obj is symbol {
  return typeof obj === 'symbol';
}

/**
 * Checks if a value is a valid TokenType (class constructor, symbol, or Token instance).
 */
export function isTokenType<T = unknown>(
  token: unknown
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
export function isFactoryProvider<T>(obj: unknown): obj is FactoryProvider<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof (obj as any).useFactory === 'function'
  );
}

export function isValueProvider<T>(obj: unknown): obj is ValueProvider<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof (obj as any).useValue !== 'undefined'
  );
}

export function isClassProvider<T>(obj: unknown): obj is ClassProvider<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    typeof (obj as any).useClass === 'function'
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
  obj: unknown
): obj is { providers?: any[]; imports?: any[]; exports?: any[] } {
  return (
    !!obj && typeof obj === 'object' && ('providers' in obj || 'imports' in obj)
  );
}

export function isPromise(val: any): val is Promise<any> {
  return !!val && typeof val.then === 'function';
}

/**
 * Checks if a value is a ProviderConfigObject (has useClass, useValue, or useFactory, but not token).
 */
export function isProviderConfigObject(obj: unknown): boolean {
  return !!(
    obj &&
    typeof obj === 'object' &&
    !('token' in obj) &&
    ('useClass' in obj || 'useValue' in obj || 'useFactory' in obj)
  );
}

export function isDisposable(obj: unknown): obj is Disposable {
  return !!(
    obj &&
    typeof obj === 'object' &&
    (Symbol.dispose in obj || Symbol.asyncDispose in obj)
  );
}

export function isAsyncDisposable(obj: unknown): obj is AsyncDisposable {
  return !!(obj && typeof obj === 'object' && Symbol.asyncDispose in obj);
}
