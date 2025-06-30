import type {
  TokenType,
  Constructor,
  Provider,
  ModuleProvider,
  Registration,
  Lifecycle,
  ReactiveStream,
} from './types.js';
import {
  getServiceMetadata,
  getInjectMetadata,
  getModuleMetadata,
  generateTokenFromClass,
  isConstructor,
  isToken,
  isProvider,
} from './metadata.js';
import { Stream } from './reactive.js';

/**
 * Internal provider registration
 */
interface ProviderRegistration {
  token: TokenType;
  factory: () => Promise<any>;
  dependencies: TokenType[];
  singleton: boolean;
  stream?: Stream<any>;
}

/**
 * The main DI Container - async-first, strongly typed
 */
export class Container implements Lifecycle {
  private providers = new Map<TokenType, ProviderRegistration>();
  private instances = new Map<TokenType, any>();
  private resolving = new Set<TokenType>();
  private registeredModules = new Set<Constructor>();
  private moduleInstances: any[] = [];
  private _isStarted = false;

  /**
   * Register providers, classes, or modules
   */
  register(...registrations: Registration[]): this {
    for (const registration of registrations) {
      this.processRegistration(registration);
    }
    return this;
  }

  /**
   * Register a module and process its configuration
   */
  registerModule(moduleConstructor: Constructor): this {
    // Prevent duplicate registration
    if (this.registeredModules.has(moduleConstructor)) {
      return this;
    }

    this.registeredModules.add(moduleConstructor);

    const moduleConfig = getModuleMetadata(moduleConstructor);
    if (!moduleConfig) {
      throw new Error(
        `No module metadata found for ${moduleConstructor.name}. Did you forget the @Module decorator?`
      );
    }

    // Process imports first
    if (moduleConfig.imports) {
      for (const importedModule of moduleConfig.imports) {
        this.registerModule(importedModule);
      }
    }

    // Process providers
    if (moduleConfig.providers) {
      for (const provider of moduleConfig.providers) {
        if (isConstructor(provider)) {
          // Register class provider
          this.registerClass(provider);
        } else if (
          provider &&
          typeof provider === 'object' &&
          'token' in provider
        ) {
          // Register provider config with explicit token
          const { token, ...providerConfig } = provider;
          this.registerProvider(token, providerConfig as Provider);
        }
      }
    }

    // Store module instance for lifecycle management
    const moduleToken = generateTokenFromClass(moduleConstructor);
    this.providers.set(moduleToken, {
      token: moduleToken,
      factory: async () => {
        const moduleInstance = new moduleConstructor();
        this.moduleInstances.push(moduleInstance);
        return moduleInstance;
      },
      dependencies: [],
      singleton: true,
    });

    return this;
  }

  /**
   * Process a single registration
   */
  private processRegistration(registration: Registration): void {
    if (isConstructor(registration)) {
      // Check if it's a module first
      const moduleConfig = getModuleMetadata(registration);
      if (moduleConfig) {
        this.registerModule(registration);
      } else {
        // Auto-register class
        this.registerClass(registration);
      }
    } else if (Array.isArray(registration)) {
      const [first, second, third] = registration;

      if (isToken(first) && isConstructor(second)) {
        // [Token, Class] or [Token, Class, deps]
        const deps = Array.isArray(third) ? third : [];
        this.registerClass(second, first, deps);
      } else if (isConstructor(first) && Array.isArray(second)) {
        // [Class, deps]
        this.registerClass(first, undefined, second);
      } else if (isToken(first) && isProvider(second)) {
        // [Token, Provider]
        this.registerProvider(first, second as Provider);
      }
    }
  }

  /**
   * Register a class as a provider
   */
  private registerClass(
    constructor: Constructor,
    token?: TokenType,
    explicitDeps?: TokenType[]
  ): void {
    const serviceToken =
      token ||
      getServiceMetadata(constructor)?.token ||
      generateTokenFromClass(constructor);

    const dependencies = explicitDeps || this.extractDependencies(constructor);

    this.providers.set(serviceToken, {
      token: serviceToken,
      factory: async () => {
        const deps = await this.resolveDependencies(dependencies);
        return new constructor(...deps);
      },
      dependencies,
      singleton: true,
    });
  }

  /**
   * Register a provider configuration
   */
  private registerProvider(token: TokenType, provider: Provider): void {
    let factory: () => Promise<any>;
    let dependencies: TokenType[] = [];

    if ('useValue' in provider) {
      factory = async () => provider.useValue;
    } else if ('useClass' in provider) {
      dependencies = this.extractDependencies(provider.useClass as Constructor);
      factory = async () => {
        const deps = await this.resolveDependencies(dependencies);
        return new provider.useClass(...deps);
      };
    } else if ('useFactory' in provider) {
      dependencies = provider.deps || [];
      factory = async () => {
        const deps = await this.resolveDependencies(dependencies);
        return await provider.useFactory(...deps);
      };
    } else {
      throw new Error(`Invalid provider configuration for token ${token}`);
    }

    this.providers.set(token, {
      token,
      factory,
      dependencies,
      singleton: true,
    });
  }

  /**
   * Extract constructor dependencies from metadata
   */
  private extractDependencies(constructor: Constructor): TokenType[] {
    const injectMeta = getInjectMetadata(constructor);
    if (!injectMeta) return [];

    const paramTypes =
      (Reflect as any).getMetadata?.('design:paramtypes', constructor) || [];
    const dependencies: TokenType[] = [];

    for (let i = 0; i < paramTypes.length; i++) {
      const explicitToken = injectMeta.tokens.get(i);
      if (explicitToken) {
        dependencies[i] = explicitToken;
      } else {
        // Try to auto-generate token from parameter type
        const paramType = paramTypes[i];
        if (paramType && isConstructor(paramType)) {
          dependencies[i] = generateTokenFromClass(paramType);
        }
      }
    }

    return dependencies;
  }

  /**
   * Resolve multiple dependencies
   */
  private async resolveDependencies(dependencies: TokenType[]): Promise<any[]> {
    return Promise.all(dependencies.map((dep) => this.resolve(dep)));
  }

  /**
   * Resolve a single dependency
   */
  async resolve<T>(token: TokenType<T>): Promise<T> {
    // Check for circular dependencies
    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected for token: ${token}`);
    }

    // Return cached instance if it exists
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    // Get provider registration
    const registration = this.providers.get(token);
    if (!registration) {
      throw new Error(`No provider found for token: ${token}`);
    }

    // Mark as resolving
    this.resolving.add(token);

    try {
      // Create instance
      const instance = await registration.factory();

      // Cache if singleton
      if (registration.singleton) {
        this.instances.set(token, instance);
      }

      // Start lifecycle if needed
      if (
        this._isStarted &&
        instance &&
        typeof instance.onStart === 'function'
      ) {
        await instance.onStart();
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  /**
   * Create a reactive stream for a provider
   */
  stream<T>(token: TokenType<T>): ReactiveStream<T> {
    const registration = this.providers.get(token);
    if (!registration) {
      throw new Error(`No provider found for token: ${token}`);
    }

    if (!registration.stream) {
      registration.stream = new Stream<T>();

      // Emit initial value when resolved
      this.resolve(token).then((value) => {
        registration.stream!.emit(value);
      });
    }

    return registration.stream;
  }

  /**
   * Update a provider's implementation live
   */
  async update<T>(
    token: TokenType<T>,
    newProvider: Provider<T>
  ): Promise<void> {
    // Remove old instance
    this.instances.delete(token);

    // Register new provider
    this.registerProvider(token, newProvider);

    // Resolve new instance
    const newInstance = await this.resolve(token);

    // Emit to stream if it exists
    const registration = this.providers.get(token);
    if (registration?.stream) {
      registration.stream.emit(newInstance);
    }
  }

  /**
   * Check if a token is registered
   */
  has(token: TokenType): boolean {
    return this.providers.has(token);
  }

  /**
   * Get all registered tokens
   */
  getTokens(): TokenType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Start the container and all providers
   */
  async onStart(): Promise<void> {
    if (this._isStarted) return;

    this._isStarted = true;

    // Start all module instances first (in registration order)
    for (const moduleInstance of this.moduleInstances) {
      if (moduleInstance && typeof moduleInstance.onStart === 'function') {
        await moduleInstance.onStart();
      }
    }

    // Start all other instances
    for (const instance of this.instances.values()) {
      if (
        instance &&
        typeof instance.onStart === 'function' &&
        !this.moduleInstances.includes(instance)
      ) {
        await instance.onStart();
      }
    }
  }

  /**
   * Stop the container and all providers
   */
  async onStop(): Promise<void> {
    if (!this._isStarted) return;

    // Stop all non-module instances first
    for (const instance of this.instances.values()) {
      if (
        instance &&
        typeof instance.onStop === 'function' &&
        !this.moduleInstances.includes(instance)
      ) {
        await instance.onStop();
      }
    }

    // Stop all module instances in reverse order
    for (let i = this.moduleInstances.length - 1; i >= 0; i--) {
      const moduleInstance = this.moduleInstances[i];
      if (moduleInstance && typeof moduleInstance.onStop === 'function') {
        await moduleInstance.onStop();
      }
    }

    this._isStarted = false;
  }

  /**
   * Dispose the container and clean up resources
   */
  async onDispose(): Promise<void> {
    await this.onStop();

    // Dispose all non-module instances first
    for (const instance of this.instances.values()) {
      if (
        instance &&
        typeof instance.onDispose === 'function' &&
        !this.moduleInstances.includes(instance)
      ) {
        await instance.onDispose();
      }
    }

    // Dispose all module instances in reverse order
    for (let i = this.moduleInstances.length - 1; i >= 0; i--) {
      const moduleInstance = this.moduleInstances[i];
      if (moduleInstance && typeof moduleInstance.onDispose === 'function') {
        await moduleInstance.onDispose();
      }
    }

    // Close all streams
    for (const registration of this.providers.values()) {
      if (registration.stream) {
        registration.stream.close();
      }
    }

    // Clear all data
    this.providers.clear();
    this.instances.clear();
    this.resolving.clear();
    this.registeredModules.clear();
    this.moduleInstances = [];
  }

  /**
   * Get container status
   */
  get isStarted(): boolean {
    return this._isStarted;
  }
}
