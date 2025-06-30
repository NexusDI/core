import type { TokenType } from './token.js';

// Re-export TokenType for convenience
export type { TokenType } from './token.js';

/**
 * Constructor type for classes
 */
export type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Provider configuration for value providers
 */
export interface ValueProvider<T = unknown> {
  readonly token?: TokenType<T>;
  readonly useValue: T;
}

/**
 * Provider configuration for class providers
 */
export interface ClassProvider<T = unknown> {
  readonly token?: TokenType<T>;
  readonly useClass: Constructor<T>;
}

/**
 * Provider configuration for factory providers
 */
export interface FactoryProvider<T = unknown> {
  readonly token?: TokenType<T>;
  readonly useFactory: (...deps: any[]) => T | Promise<T>;
  readonly deps?: TokenType[];
}

/**
 * Union type for all provider configurations
 */
export type Provider<T = unknown> =
  | ValueProvider<T>
  | ClassProvider<T>
  | FactoryProvider<T>;

/**
 * Module provider - can be a constructor or provider config
 */
export type ModuleProvider<T = unknown> =
  | Constructor<T>
  | (Provider<T> & { token: TokenType<T> });

/**
 * Configuration for a module
 */
export interface ModuleConfig {
  readonly providers?: ModuleProvider[];
  readonly imports?: Constructor[];
  readonly exports?: TokenType[];
}

/**
 * Lifecycle methods for providers and modules
 */
export interface Lifecycle {
  onStart?(): void | Promise<void>;
  onStop?(): void | Promise<void>;
  onDispose?(): void | Promise<void>;
}

/**
 * Reactive stream interface for multi-value providers
 */
export interface ReactiveStream<T> {
  subscribe(callback: (value: T) => void): () => void;
  unsubscribe(callback: (value: T) => void): void;
  emit(value: T): void;
  close(): void;
}

/**
 * Registration types for the container
 */
export type Registration =
  | Constructor // Auto everything
  | [TokenType<any>, Constructor] // Explicit token
  | [TokenType<any>, Constructor, TokenType<any>[]] // Explicit token + deps
  | [Constructor, TokenType<any>[]] // Auto token + explicit deps
  | [TokenType<any>, Provider<any>]; // Token + provider config
