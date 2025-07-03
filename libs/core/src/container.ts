/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  TokenType,
  IContainer,
  InjectionMetadata,
  ModuleProvider,
  Constructor,
  InternalProvider,
  ModuleConfig,
  Disposable,
  AsyncDisposable,
} from './types';
import { METADATA_KEYS } from './constants';
import { getMetadata } from './helpers';
import {
  isTokenType,
  isConstructor,
  isModuleConfig,
  isPromise,
} from './guards';
import {
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
} from './exceptions';

/**
 * Internal registry for providers with async support
 */
interface ProviderRegistry<T = any> {
  token: TokenType<T>;
  provider: InternalProvider<T>;
  singleton: boolean;
  eager: boolean;
  instance?: T | Promise<T>;
  disposed: boolean;
}

/**
 * The main DI container class for NexusDI - now async-first with Symbol.dispose support.
 *
 * @example
 * import { Nexus } from '@nexusdi/core';
 * const container = new Nexus(AppModule);
 * const logger = container.get(LoggerService);
 * @see https://nexus.js.org/docs/container/nexus-class
 */
export class Nexus implements IContainer, AsyncDisposable {
  // Core registries
  private providers = new Map<TokenType, ProviderRegistry>();
  private modules = new Set<Constructor<any>>();
  private aliases = new Map<TokenType, TokenType>();

  // Async state management
  private initializationPromise?: Promise<void>;
  private isInitialized = false;
  private isDisposed = false;

  // Circular dependency tracking
  private resolving = new Set<TokenType>();

  // Resource cleanup tracking
  private disposables: (Disposable | AsyncDisposable)[] = [];

  /**
   * Initialize the container and all eager providers.
   *
   * @example
   * await container.init();
   *
   * @see https://nexus.js.org/docs/container/nexus-class
   * @publicApi
   */
  async init(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initializationPromise = this._doInit();
    return this.initializationPromise;
  }

  private async _doInit(): Promise<void> {
    // Initialize all eager providers
    const eagerProviders = Array.from(this.providers.values()).filter(
      (registry) => registry.eager && !registry.instance
    );

    await Promise.all(
      eagerProviders.map((registry) => this._resolveProvider(registry))
    );

    this.isInitialized = true;
  }

  /**
   * Register a provider, module, or configuration.
   *
   * @example
   * await container.set(MyService);
   * await container.set({ token: TOKEN, useValue: Promise.resolve(123) }); // Register a value provider
   * await container.set({ token: TOKEN, useFactory: async () => 123 }); // Register a factory provider
   * await container.set(MyModule); // Register a module
   * await container.set(MyDynamicModule.config({ ...config })); // Register a dynamic module
   *
   * @see https://nexus.js.org/docs/providers-and-services
   * @see https://nexus.js.org/docs/tokens
   * @see https://nexus.js.org/docs/modules/module-basics
   * @see https://nexus.js.org/docs/container/nexus-class
   * @publicApi
   */
  async set(
    input: ModuleProvider | Constructor | ModuleConfig | Promise<ModuleConfig>
  ): Promise<this> {
    if (this.isDisposed) {
      throw new Error('Cannot set providers on a disposed container');
    }

    // Handle Promise<ModuleConfig>
    if (isPromise(input)) {
      const resolved = await input;
      if (isModuleConfig(resolved)) {
        await this._registerModuleConfig(resolved);
        return this;
      } else {
        throw new InvalidProvider('Promise must resolve to a ModuleConfig');
      }
    }

    // Handle different registration types
    if (isConstructor(input)) {
      await this._registerClass(input);
    } else if (isModuleConfig(input)) {
      await this._registerModuleConfig(input);
    } else if (typeof input === 'object' && input !== null) {
      await this._registerProvider(input as ModuleProvider);
    } else {
      throw new InvalidProvider('Invalid registration input');
    }

    return this;
  }

  /**
   * Register multiple providers, modules, or configurations in parallel.
   *
   * @example
   * await container.setMany(MyService, OtherService, { token: TOKEN, useValue: 123 });
   *
   * @see https://nexus.js.org/docs/providers-and-services
   * @see https://nexus.js.org/docs/modules/module-basics
   * @see https://nexus.js.org/docs/container/nexus-class
   * @publicApi
   */
  async setMany(
    ...inputs: (
      | ModuleProvider
      | Constructor
      | ModuleConfig
      | Promise<ModuleConfig>
    )[]
  ): Promise<this> {
    if (this.isDisposed) {
      throw new Error('Cannot set providers on a disposed container');
    }

    // Register all inputs in parallel for better performance
    await Promise.all(
      inputs.map(async (input) => {
        // Handle Promise<ModuleConfig>
        if (isPromise(input)) {
          const resolved = await input;
          if (isModuleConfig(resolved)) {
            await this._registerModuleConfig(resolved);
          } else {
            throw new InvalidProvider('Promise must resolve to a ModuleConfig');
          }
        } else if (isConstructor(input)) {
          await this._registerClass(input);
        } else if (isModuleConfig(input)) {
          await this._registerModuleConfig(input);
        } else if (typeof input === 'object' && input !== null) {
          await this._registerProvider(input as ModuleProvider);
        } else {
          throw new InvalidProvider('Invalid registration input');
        }
      })
    );

    return this;
  }

  /**
   * Get an instance by token.
   *
   * @example
   * const logger = await container.get(LoggerService);
   * const value = await container.get(TOKEN);
   *
   * @throws {NoProvider} If the token is not registered
   *
   * @see https://nexus.js.org/docs/providers-and-services
   * @see https://nexus.js.org/docs/tokens
   * @see https://nexus.js.org/docs/container/nexus-class#get
   * @publicApi
   */
  async get<T>(token: TokenType<T>): Promise<T> {
    if (this.isDisposed) {
      throw new Error('Cannot get from a disposed container');
    }

    const actualToken = this._getActualToken(token);
    const registry = this.providers.get(actualToken);

    if (!registry) {
      throw new NoProvider(token);
    }

    return this._resolveProvider(registry);
  }

  /**
   * Check if a token is registered.
   *
   * @example
   * if (container.has(LoggerService)) { ... }
   *
   * @see https://nexus.js.org/docs/container/nexus-class#has
   * @see https://nexus.js.org/docs/tokens
   * @publicApi
   */
  has(token: TokenType<unknown>): boolean {
    if (this.isDisposed) return false;

    try {
      const actualToken = this._getActualToken(token);
      return (
        this.providers.has(actualToken) ||
        this.modules.has(actualToken as Constructor)
      );
    } catch {
      return false;
    }
  }

  /**
   * Resolve dependencies for a class without registering it.
   * Useful for transient instances that shouldn't be managed by the container.
   *
   * @example
   * const temp = await container.resolve(TempService);
   *
   * @throws {InvalidToken} If the argument is not a constructor
   *
   * @see https://nexus.js.org/docs/container/nexus-class#resolve
   * @see https://nexus.js.org/docs/providers-and-services
   * @publicApi
   */
  async resolve<T>(ctor: Constructor<T>): Promise<T> {
    if (!isConstructor(ctor)) {
      throw new InvalidToken('resolve() requires a constructor function');
    }

    // For native decorators, we require explicit @Inject decorators
    // Check if the class has injection metadata
    const ctorInjectionMetadata: InjectionMetadata[] =
      getMetadata(ctor, METADATA_KEYS.INJECT_METADATA) || [];
    const propInjectionMetadata: InjectionMetadata[] =
      getMetadata(ctor.prototype, METADATA_KEYS.INJECT_METADATA) || [];

    // Resolve constructor parameters from explicit injection metadata
    const params = await this._resolveConstructorParams(ctorInjectionMetadata);

    // Create instance
    const instance = new ctor(...params);

    // Inject properties
    await this._injectProperties(instance, propInjectionMetadata);

    return instance;
  }

  /**
   * Create a child container.
   *
   * @example
   * const child = container.createChild();
   *
   * @see https://nexus.js.org/docs/container/nexus-class#child-containers
   * @publicApi
   */
  createChild(): IContainer {
    const child = new Nexus();

    // Copy provider registries
    for (const [token, registry] of this.providers) {
      child.providers.set(token, { ...registry, instance: undefined });
    }

    // Copy aliases
    for (const [alias, target] of this.aliases) {
      child.aliases.set(alias, target);
    }

    // Copy modules
    for (const module of this.modules) {
      child.modules.add(module);
    }

    return child;
  }

  /**
   * Dispose all resources and clean up.
   *
   * @example
   * await container.dispose();
   *
   * @see https://nexus.js.org/docs/container/nexus-class#disposal
   * @publicApi
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // Dispose all tracked disposables in reverse order
    const disposables = [...this.disposables].reverse();
    await Promise.all(
      disposables.map(async (disposable) => {
        try {
          if (Symbol.asyncDispose in disposable) {
            await (disposable as AsyncDisposable)[Symbol.asyncDispose]();
          } else if (Symbol.dispose in disposable) {
            const result = (disposable as Disposable)[Symbol.dispose]();
            if (isPromise(result)) {
              await result;
            }
          }
        } catch (error) {
          console.error('Error disposing resource:', error);
        }
      })
    );

    // Dispose all provider instances
    const instances = Array.from(this.providers.values())
      .map((registry) => registry.instance)
      .filter(Boolean);

    await Promise.all(
      instances.map(async (instance) => {
        if (!instance) return;

        const resolved = await Promise.resolve(instance);
        if (resolved && typeof resolved === 'object') {
          try {
            if (Symbol.asyncDispose in resolved) {
              await (resolved as AsyncDisposable)[Symbol.asyncDispose]();
            } else if (Symbol.dispose in resolved) {
              const result = (resolved as Disposable)[Symbol.dispose]();
              if (isPromise(result)) {
                await result;
              }
            }
          } catch (error) {
            console.error('Error disposing provider instance:', error);
          }
        }
      })
    );

    this.clear();
  }

  /**
   * Symbol.asyncDispose implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  /**
   * Clear all providers and instances.
   *
   * @example
   * await container.clear();
   *
   * @see https://nexus.js.org/docs/container/nexus-class#clear
   * @publicApi
   */
  async clear(): Promise<void> {
    this.providers.clear();
    this.modules.clear();
    this.aliases.clear();
    this.disposables = [];
    this.isInitialized = false;
    this.initializationPromise = undefined;
    this.resolving.clear();
  }

  /**
   * List all registered providers and modules.
   *
   * @example
   * const { providers, modules } = container.list();
   *
   * @see https://nexus.js.org/docs/container/nexus-class#introspection
   * @publicApi
   */
  list(): { providers: TokenType[]; modules: string[] } {
    return {
      providers: Array.from(this.providers.keys()),
      modules: Array.from(this.modules).map((m) => m.name),
    };
  }

  // Private implementation methods

  private _getActualToken<T>(token: TokenType<T>): TokenType<T> {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    return this.aliases.get(token) || token;
  }

  private async _registerClass(ctor: Constructor): Promise<void> {
    // Check if it's a module
    const moduleMetadata = getMetadata(ctor, METADATA_KEYS.MODULE_METADATA);
    if (moduleMetadata) {
      await this._registerModule(ctor);
      return;
    }

    // Check if it's a decorated service
    const serviceMetadata = getMetadata(ctor, METADATA_KEYS.SERVICE_METADATA);
    const providerMetadata = getMetadata(ctor, METADATA_KEYS.PROVIDER_METADATA);

    if (!serviceMetadata && !providerMetadata) {
      throw new InvalidProvider(
        `Class ${ctor.name} must be decorated with @Service or registered with explicit configuration`
      );
    }

    // Register as a regular provider
    const token = this._inferToken(ctor);
    const provider: InternalProvider = {
      type: 'class',
      token,
      useClass: ctor,
    };

    this.providers.set(token, {
      token,
      provider,
      singleton: true,
      eager: false,
      disposed: false,
    });
  }

  private async _registerProvider(input: ModuleProvider): Promise<void> {
    if (isConstructor(input)) {
      await this._registerClass(input);
      return;
    }

    const { token, ...config } = input as any;
    const actualToken = token || this._generateAutoToken();

    let provider: InternalProvider;

    if ('useClass' in config) {
      provider = {
        type: 'class',
        token: actualToken,
        useClass: config.useClass,
      };
    } else if ('useValue' in config) {
      provider = {
        type: 'value',
        token: actualToken,
        useValue: config.useValue,
      };
    } else if ('useFactory' in config) {
      if (typeof config.useFactory !== 'function') {
        throw new InvalidProvider(
          `Factory provider must have useFactory as a function, got ${typeof config.useFactory}`
        );
      }
      provider = {
        type: 'factory',
        token: actualToken,
        useFactory: config.useFactory,
        deps: config.deps || [],
      };
    } else {
      throw new InvalidProvider('Invalid provider configuration');
    }

    this.providers.set(actualToken, {
      token: actualToken,
      provider,
      singleton: config.singleton !== false,
      eager: config.eager === true,
      disposed: false,
    });

    // Set up aliases if needed
    if (provider.type === 'class' && actualToken !== provider.useClass) {
      this.aliases.set(provider.useClass, actualToken);
    }
  }

  private async _registerModule(moduleClass: Constructor): Promise<void> {
    if (this.modules.has(moduleClass)) {
      return; // Already registered
    }

    this.modules.add(moduleClass);

    const moduleConfig = getMetadata(
      moduleClass,
      METADATA_KEYS.MODULE_METADATA
    );
    if (!moduleConfig) {
      throw new InvalidModule(moduleClass);
    }

    await this._registerModuleConfig(moduleConfig);
  }

  private async _registerModuleConfig(config: ModuleConfig): Promise<void> {
    // Process imports first
    if (config.imports) {
      await Promise.all(
        config.imports.map((importModule) => this._registerModule(importModule))
      );
    }

    // Process providers
    if (config.providers) {
      await Promise.all(
        config.providers.map((provider) => this._registerProvider(provider))
      );
    }
  }

  private async _resolveProvider<T>(registry: ProviderRegistry<T>): Promise<T> {
    // Check for circular dependency
    if (this.resolving.has(registry.token)) {
      throw new Error(
        `Circular dependency detected: ${this._tokenToString(registry.token)}`
      );
    }

    // Return existing instance if singleton
    if (registry.singleton && registry.instance) {
      return await Promise.resolve(registry.instance);
    }

    this.resolving.add(registry.token);

    try {
      const instance = await this._createInstance(registry.provider);

      // Cache if singleton
      if (registry.singleton) {
        registry.instance = instance;
      }

      // Track for disposal if disposable
      if (instance && typeof instance === 'object') {
        if (Symbol.dispose in instance || Symbol.asyncDispose in instance) {
          this.disposables.push(instance as Disposable | AsyncDisposable);
        }
      }

      return instance;
    } finally {
      this.resolving.delete(registry.token);
    }
  }

  private async _createInstance<T>(provider: InternalProvider<T>): Promise<T> {
    switch (provider.type) {
      case 'value':
        return Promise.resolve(provider.useValue);

      case 'class':
        return this._instantiateClass(provider.useClass);

      case 'factory': {
        const deps = await this._resolveDependencies(provider.deps || []);
        const result = provider.useFactory(...deps);
        return Promise.resolve(result);
      }

      default:
        throw new InvalidProvider(
          `Unknown provider type: ${(provider as any).type}`
        );
    }
  }

  private async _instantiateClass<T>(ctor: Constructor<T>): Promise<T> {
    // With native decorators, we don't get automatic paramtypes
    // We rely on explicit @Inject decorators or manual registration
    const ctorInjectionMetadata: InjectionMetadata[] =
      getMetadata(ctor, METADATA_KEYS.INJECT_METADATA) || [];
    const propInjectionMetadata: InjectionMetadata[] =
      getMetadata(ctor.prototype, METADATA_KEYS.INJECT_METADATA) || [];

    // Resolve constructor parameters only from explicit injection metadata
    const params = await this._resolveConstructorParams(ctorInjectionMetadata);

    // Create instance
    const instance = new ctor(...params);

    // Inject properties
    await this._injectProperties(instance, propInjectionMetadata);

    return instance;
  }

  private async _resolveConstructorParams(
    injectionMetadata: InjectionMetadata[]
  ): Promise<any[]> {
    // Sort by parameter index to ensure correct order
    const sortedMetadata = injectionMetadata
      .filter((m) => m.propertyKey === undefined) // Constructor parameters only
      .sort((a, b) => a.index - b.index);

    // Create params array
    const maxIndex =
      sortedMetadata.length > 0
        ? Math.max(...sortedMetadata.map((m) => m.index))
        : -1;
    const params: any[] = new Array(maxIndex + 1);

    // Resolve each explicitly injected parameter
    for (const metadata of sortedMetadata) {
      if (metadata.optional) {
        // For optional dependencies, check if provider exists first
        const actualToken = this._getActualToken(metadata.token);
        const registry = this.providers.get(actualToken);
        if (registry) {
          params[metadata.index] = await this._resolveProvider(registry);
        } else {
          params[metadata.index] = undefined;
        }
      } else {
        params[metadata.index] = await this.get(metadata.token);
      }
    }

    return params;
  }

  private async _injectProperties(
    instance: any,
    injectionMetadata: InjectionMetadata[]
  ): Promise<void> {
    for (const metadata of injectionMetadata) {
      if (metadata.propertyKey !== undefined) {
        if (metadata.optional) {
          // For optional dependencies, check if provider exists first
          const actualToken = this._getActualToken(metadata.token);
          const registry = this.providers.get(actualToken);
          if (registry) {
            instance[metadata.propertyKey] = await this._resolveProvider(
              registry
            );
          } else {
            instance[metadata.propertyKey] = undefined;
          }
        } else {
          instance[metadata.propertyKey] = await this.get(metadata.token);
        }
      }
    }
  }

  private async _resolveDependencies(deps: TokenType[]): Promise<any[]> {
    return Promise.all(deps.map((dep) => this.get(dep)));
  }

  private _inferToken(ctor: Constructor): TokenType {
    // Check for explicit token from @Service decorator
    const serviceMetadata = getMetadata(ctor, METADATA_KEYS.SERVICE_METADATA);
    if (serviceMetadata?.token) {
      return serviceMetadata.token;
    }

    // Check for legacy provider metadata
    const providerMetadata = getMetadata(ctor, METADATA_KEYS.PROVIDER_METADATA);
    if (providerMetadata?.token) {
      return providerMetadata.token;
    }

    // Use the constructor itself as token
    return ctor;
  }

  private _generateAutoToken(): TokenType {
    return Symbol(`auto-token-${Math.random().toString(36).substring(2, 11)}`);
  }

  private _tokenToString(token: TokenType): string {
    if (typeof token === 'symbol') {
      return token.toString();
    }
    if (typeof token === 'function') {
      return token.name || 'Anonymous';
    }
    if (token && typeof token === 'object' && 'toString' in token) {
      return token.toString();
    }
    return String(token);
  }
}
