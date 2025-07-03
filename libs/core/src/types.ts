/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Token } from './token';

export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * [INTERNAL] Represents a token for DI registration. Used internally to support class, or Token-based tokens.
 *
 * Users should use the exported `Token` class for custom tokens instead of Symbol or string.
 *
 * @see https://nexus.js.org/docs/modules/tokens
 */
export type TokenType<T = any> = Token<T> | symbol | Constructor<T>;

// Base provider interface
export interface BaseProvider<T = unknown> {
  token?: TokenType<T>;
}

// Provider configuration types
export type ClassProviderConfig<T = unknown> = {
  useClass: Constructor<T>;
};

export interface ClassProvider<T = unknown>
  extends ClassProviderConfig<T>,
    BaseProvider<T> {}

export type ValueProviderConfig<T = unknown> = {
  useValue: T | Promise<T>; // Support async values
};

export interface ValueProvider<T = unknown>
  extends ValueProviderConfig<T>,
    BaseProvider<T> {}

export type FactoryProviderConfig<T = unknown> = {
  useFactory: (...args: any[]) => T | Promise<T>; // Support async factories
  deps?: TokenType[];
};

export interface FactoryProvider<T = unknown>
  extends FactoryProviderConfig<T>,
    BaseProvider<T> {}

export type ProviderConfigObject<T = unknown> =
  | ClassProviderConfig<T>
  | ValueProviderConfig<T>
  | FactoryProviderConfig<T>;

export type Provider<T = unknown> =
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>;

// Internal provider types (with discriminant 'type')
interface InternalClassProvider<T = unknown> extends ClassProvider<T> {
  type: 'class';
}
interface InternalValueProvider<T = unknown> extends ValueProvider<T> {
  type: 'value';
}
interface InternalFactoryProvider<T = unknown> extends FactoryProvider<T> {
  type: 'factory';
}
type InternalProvider<T = unknown> =
  | InternalClassProvider<T>
  | InternalValueProvider<T>
  | InternalFactoryProvider<T>;

/**
 * Registration options for providers and modules
 */
export interface RegistrationOptions<T = any> {
  token?: TokenType<T>;
  provider?: ProviderConfigObject<T>;
  singleton?: boolean;
  eager?: boolean; // Initialize immediately during container startup
}

/**
 * Provider definition for modules and container registration
 */
export type ModuleProvider<T = any> =
  | Constructor<T> // Just a class
  | (Provider<T> & { token: TokenType<T> }) // Provider with explicit token
  | { token: TokenType<T>; useClass: Constructor<T>; singleton?: boolean } // Object form
  | { token: TokenType<T>; useValue: T | Promise<T> } // Value provider
  | {
      token: TokenType<T>;
      useFactory: (...args: any[]) => T | Promise<T>;
      deps?: TokenType[];
    }; // Factory provider

/**
 * Disposable interface for resource cleanup
 */
export interface Disposable {
  [Symbol.dispose](): void | Promise<void>;
}

/**
 * Async disposable interface for resource cleanup
 */
export interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Configuration for a provider. Used with @Service decorator.
 */
export type ProviderConfig<T = any> = {
  token?: TokenType<T>;
  singleton?: boolean;
  eager?: boolean;
};

/**
 * Configuration for a module. Used with @Module decorator.
 */
export type ModuleConfig = {
  imports?: Constructor[];
  providers?: ModuleProvider[];
  exports?: TokenType[]; // If not specified, all providers are exported
};

/**
 * Container interface for dependency injection
 *
 * @example
 * import { Nexus } from '@nexusdi/core';
 * const container: IContainer = new Nexus();
 */
export interface IContainer {
  /**
   * Register a provider, module, or configuration.
   *
   * @example
   * await container.set(MyService);
   * await container.set({ token: TOKEN, useValue: 123 });
   * await container.set({ imports: [OtherModule], providers: [MyService] });
   *
   * @param input - The provider, class, or module config to register
   * @returns The container instance (for chaining)
   */
  set(input: ModuleProvider | Constructor | ModuleConfig): Promise<this>;

  /**
   * Register multiple providers, modules, or configurations in parallel.
   *
   * @example
   * await container.setMany(MyService, OtherService, { token: TOKEN, useValue: 123 });
   *
   * @param inputs - Providers, classes, or module configs to register
   * @returns The container instance (for chaining)
   */
  setMany(
    ...inputs: (ModuleProvider | Constructor | ModuleConfig)[]
  ): Promise<this>;

  /**
   * Get an instance by token.
   *
   * @example
   * const logger = await container.get(LoggerService);
   * const value = await container.get(TOKEN);
   *
   * @param token - The token or class to resolve
   * @returns The resolved instance
   */
  get<T>(token: TokenType<T>): Promise<T>;

  /**
   * Check if a token is registered.
   *
   * @example
   * if (container.has(LoggerService)) { ... }
   *
   * @param token - The token or class to check
   * @returns True if registered, false otherwise
   */
  has(token: TokenType<unknown>): boolean;

  /**
   * Resolve dependencies for a class without registering it.
   * Useful for transient instances that shouldn't be managed by the container.
   *
   * @example
   * const temp = await container.resolve(TempService);
   *
   * @param ctor - The class constructor to resolve
   * @returns The resolved instance
   */
  resolve<T>(ctor: Constructor<T>): Promise<T>;

  /**
   * Create a child container.
   *
   * @example
   * const child = container.createChild();
   *
   * @returns A new child container
   */
  createChild(): IContainer;

  /**
   * Clear all providers and instances.
   *
   * @example
   * await container.clear();
   */
  clear(): Promise<void>;

  /**
   * Initialize the container and all eager providers.
   *
   * @example
   * await container.init();
   */
  init(): Promise<void>;
}

/**
 * Metadata for injection, used internally by @Inject and @Optional.
 */
export type InjectionMetadata = {
  token: TokenType;
  index: number;
  propertyKey?: string | symbol;
  optional?: boolean;
};

export type DynamicModuleConfig<Config = unknown> =
  | Config
  | ProviderConfigObject<Config>;
export type DynamicModuleConfigAsync<Config = unknown> =
  | Promise<Config>
  | ProviderConfigObject<Promise<Config>>;

// Export internal types for container use only (not public API)
export type {
  InternalClassProvider,
  InternalValueProvider,
  InternalFactoryProvider,
  InternalProvider,
};
