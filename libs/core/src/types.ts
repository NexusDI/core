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

export interface BaseProvider<T = unknown> {
  token: TokenType<T>;
}

export type ClassProviderConfig<T = unknown> = {
  useClass: Constructor<T>;
};

// Public (user-facing) provider types
export interface ClassProvider<T = unknown>
  extends ClassProviderConfig<T>,
    BaseProvider<T> {}

export type ValueProviderConfig<T = unknown> = {
  useValue: T;
};

export interface ValueProvider<T = unknown>
  extends ValueProviderConfig<T>,
    BaseProvider<T> {}

export type FactoryProviderConfig<T = unknown> = {
  useFactory: (...args: any[]) => T;
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

// Internal (container-facing) provider types (with discriminant 'type')
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
 * Provider definition for modules. Used in the 'imports' property of @Module.
 *
 * @example
 * import { ModuleProvider } from '@nexusdi/core';
 * const imports: ModuleProvider[] = [OtherModule];
 * @see https://nexus.js.org/docs/modules/module-basics
 */
export type ModuleProvider<T = any> =
  | (Provider<T> & { token: TokenType<T> })
  | Constructor<T>;

/**
 * Configuration for a provider. Used with @Service and @Provider decorators.
 *
 * @example
 * import { ProviderConfig } from '@nexusdi/core';
 * const config: ProviderConfig = { scope: 'singleton' };
 * @see https://nexus.js.org/docs/modules/providers-and-services
 */
export type ProviderConfig<T = any> = {
  token?: TokenType<T>;
  singleton?: boolean;
  type?: string;
};

/**
 * Configuration for a module. Used with @Module decorator.
 *
 * @example
 * import { ModuleConfig } from '@nexusdi/core';
 * const config: ModuleConfig = { providers: [MyService] };
 * @see https://nexus.js.org/docs/modules/module-basics
 */
export type ModuleConfig = {
  imports?: Constructor[];
  providers?: ModuleProvider[];
  exports?: TokenType[];
};

/**
 * Interface for the DI container. Use Nexus class for actual usage.
 *
 * @see https://nexus.js.org/docs/container/nexus-class
 */
export interface IContainer {
  get<T>(token: TokenType<T>): T;

  has(token: TokenType<unknown>): boolean;

  set<T>(token: TokenType<T>, provider: Provider<T>): void;
  set<T>(token: TokenType<T>, serviceClass: Constructor<T>): void;
  set<T>(moduleClass: Constructor<T>): void;
  set(moduleConfig: {
    providers?: ModuleProvider[];
    imports?: Constructor[];
    services?: Constructor[];
    exports?: TokenType[];
  }): void;
  set(tokenOrModuleOrConfig: any, providerOrNothing?: any): void;

  /**
   * Instantiates a new instance of the given class, resolving and injecting all dependencies.
   *
   * - Unlike `get`, this does not require the class to be registered as a provider and always returns a new instance.
   * - Useful for transient or ad-hoc objects that are not managed by the container's provider registry.
   * - Throws if dependencies cannot be resolved.
   *
   * @param target The class constructor to instantiate.
   * @returns A new instance of the class with dependencies injected.
   */
  resolve<T>(ctor: Constructor<T>): T;

  /**
   * Creates a new child container that inherits the parent container's providers.
   *
   * @returns A new container with the same providers as the parent.
   */
  createChildContainer(): IContainer;

  /**
   * Clears all providers and instances from the container.
   *
   * @see https://nexus.js.org/docs/container/nexus-class#clear
   */
  clear(): void;

  /**
   * Lists all providers and modules registered in the container.
   *
   * @returns An object containing the providers and modules registered in the container.
   */
  list(): { providers: TokenType[]; modules: string[] };
}

/**
 * Metadata for injection, used internally by @Inject and @Optional.
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
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
