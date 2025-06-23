import 'reflect-metadata';
import type { TokenType, Provider, IContainer, InjectionMetadata, ModuleProvider } from './types';
import { METADATA_KEYS } from './types';
import { Token } from './token';

export class Nexus implements IContainer {
  private providers = new Map<TokenType, Provider>();
  private instances = new Map<TokenType, any>();
  private modules = new Set<new (...args: any[]) => any>();
  private aliases = new Map<TokenType, TokenType>();

  /**
   * Get a service instance by token
   */
  get<T>(token: TokenType<T>): T {
    // Resolve aliases
    const actualToken = this.aliases.get(token) || token;
    if (!this.has(actualToken)) {
      throw new Error(`No provider found for token: ${this.tokenToString(token)}`);
    }

    const provider = this.providers.get(actualToken);
    if (!provider) {
      throw new Error(`No provider found for token: ${this.tokenToString(token)}`);
    }

    // Return singleton instance if exists
    if (this.instances.has(actualToken)) {
      return this.instances.get(actualToken);
    }

    // Create new instance
    let instance: T;

    if (provider.useValue !== undefined) {
      instance = provider.useValue;
    } else if (provider.useFactory) {
      const deps = provider.deps?.map(dep => this.get(dep)) || [];
      instance = provider.useFactory(...deps);
    } else if (provider.useClass) {
      instance = this.resolve(provider.useClass);
    } else {
      throw new Error(`Invalid provider configuration for token: ${this.tokenToString(token)}`);
    }

    // Store singleton instance for all provider types
    this.instances.set(actualToken, instance);

    return instance;
  }

  /**
   * Check if a token is registered
   */
  has(token: TokenType): boolean {
    const actualToken = this.aliases.get(token) || token;
    return this.providers.has(actualToken);
  }

  /**
   * Resolve a class by injecting its dependencies
   */
  resolve<T>(target: new (...args: any[]) => T): T {
    const paramTypes = Reflect.getMetadata(METADATA_KEYS.DESIGN_PARAMTYPES, target) || [];
    // Get constructor parameter injection metadata from the constructor
    const ctorInjectionMetadata: InjectionMetadata[] =
      Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target) || [];
    // Get property injection metadata from the prototype
    const propInjectionMetadata: InjectionMetadata[] =
      Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target.prototype) || [];

    // Create parameter array for constructor
    const params: any[] = new Array(paramTypes.length);

    // Fill in injected dependencies for constructor
    for (const metadata of ctorInjectionMetadata) {
      if (metadata.propertyKey === undefined) {
        // Constructor parameter injection
        params[metadata.index] = this.get(metadata.token);
      }
    }

    // Fill remaining parameters with resolved dependencies
    for (let i = 0; i < paramTypes.length; i++) {
      if (params[i] === undefined) {
        const paramType = paramTypes[i];
        if (paramType && paramType !== Object) {
          // Try to get the dependency by type
          if (this.has(paramType)) {
            params[i] = this.get(paramType);
          } else {
            // If not registered, try to resolve it directly
            params[i] = this.resolve(paramType);
          }
        }
      }
    }

    // Create instance
    const instance = new target(...params);

    // Handle property injection (from prototype metadata)
    for (const metadata of propInjectionMetadata) {
      if (metadata.propertyKey !== undefined) {
        (instance as any)[metadata.propertyKey] = this.get(metadata.token);
      }
    }

    return instance;
  }

  /**
   * Unified set method: register a provider, module, or dynamic module config.
   */
  set(tokenOrModuleOrConfig: any, providerOrNothing?: any): void {
    // If it's a module class (has @Module metadata)
    if (
      typeof tokenOrModuleOrConfig === 'function' &&
      Reflect && Reflect.getMetadata &&
      Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, tokenOrModuleOrConfig)
    ) {
      // Directly process the module config instead of calling setModule
      if (this.modules.has(tokenOrModuleOrConfig)) {
        return; // Module already registered
      }
      this.modules.add(tokenOrModuleOrConfig);
      const moduleConfig = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, tokenOrModuleOrConfig);
      if (!moduleConfig) {
        throw new Error(`Module ${tokenOrModuleOrConfig.name} is not properly decorated with @Module`);
      }
      this.processModuleConfig(moduleConfig);
      return;
    }
    // If it's a dynamic module config (object with services/providers/imports)
    if (
      tokenOrModuleOrConfig &&
      typeof tokenOrModuleOrConfig === 'object' &&
      (tokenOrModuleOrConfig.services || tokenOrModuleOrConfig.providers || tokenOrModuleOrConfig.imports)
    ) {
      // Directly process the module config instead of calling registerDynamicModule
      this.processModuleConfig(tokenOrModuleOrConfig);
      return;
    }
    // Otherwise, treat as provider registration
    this.setProvider(tokenOrModuleOrConfig, providerOrNothing);
  }

  /**
   * Internal: Register a provider (class, value, or factory) for a token.
   */
  private setProvider<T>(token: TokenType<T>, providerOrClass: Provider<T> | (new (...args: any[]) => T)): void {
    let provider: Provider<T>;
    if (typeof providerOrClass === 'function') {
      provider = { useClass: providerOrClass };
    } else {
      provider = providerOrClass;
    }
    this.providers.set(token, provider);
    if (provider.useClass && token !== provider.useClass) {
      this.aliases.set(provider.useClass, token);
    }
  }

  /**
   * @deprecated Use the unified set() method instead.
   */
  setModule(moduleClass: new (...args: any[]) => any): void {
    console.warn('[DEPRECATED] Use container.set(moduleClass) instead of setModule.');
    if (this.modules.has(moduleClass)) {
      return; // Module already registered
    }
    this.modules.add(moduleClass);
    const moduleConfig = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, moduleClass);
    if (!moduleConfig) {
      throw new Error(`Module ${moduleClass.name} is not properly decorated with @Module`);
    }
    this.processModuleConfig(moduleConfig);
  }

  /**
   * @deprecated Use the unified set() method instead.
   */
  registerDynamicModule(moduleConfig: {
    services?: (new (...args: any[]) => any)[];
    providers?: ModuleProvider[];
    imports?: (new (...args: any[]) => any)[];
  }): void {
    console.warn('[DEPRECATED] Use container.set(dynamicModuleConfig) instead of registerDynamicModule.');
    this.processModuleConfig(moduleConfig);
  }

  /**
   * Process module configuration (shared between setModule and registerDynamicModule)
   */
  private processModuleConfig(moduleConfig: {
    services?: (new (...args: any[]) => any)[];
    providers?: ModuleProvider[];
    imports?: (new (...args: any[]) => any)[];
  }): void {
    // Register imported modules
    if (moduleConfig.imports) {
      for (const importedModule of moduleConfig.imports) {
        this.setModule(importedModule);
      }
    }

    // Register services
    if (moduleConfig.services) {
      for (const serviceClass of moduleConfig.services) {
        const serviceConfig = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, serviceClass);
        if (serviceConfig) {
          this.set(serviceConfig.token, {
            useClass: serviceClass,
          });
        }
      }
    }

    // Register providers
    if (moduleConfig.providers) {
      for (const provider of moduleConfig.providers) {
        // Check if provider is a service class (has @Service decorator)
        if (typeof provider === 'function') {
          const serviceConfig = Reflect.getMetadata(METADATA_KEYS.SERVICE_METADATA, provider);
          if (serviceConfig) {
            this.set(serviceConfig.token, {
              useClass: provider,
            });
          } else {
            throw new Error(`Service class ${provider.name} is not decorated with @Service`);
          }
        } else {
          // Full provider object
          this.set(provider.token, provider);
        }
      }
    }
  }

  /**
   * Create a child container that inherits from this container
   */
  createChildContainer(): Nexus {
    const child = new Nexus();
    
    // Copy providers and instances
    for (const [token, provider] of this.providers) {
      child.providers.set(token, provider);
    }
    for (const [alias, target] of this.aliases) {
      child.aliases.set(alias, target);
    }
    for (const [token, instance] of this.instances) {
      child.instances.set(token, instance);
    }
    for (const module of this.modules) {
      child.modules.add(module);
    }
    return child;
  }

  /**
   * Clear all registered providers and instances
   */
  clear(): void {
    this.providers.clear();
    this.instances.clear();
    this.modules.clear();
    this.aliases.clear();
  }

  /**
   * Convert a token to a string representation for error messages
   */
  private tokenToString(token: TokenType): string {
    if (token instanceof Token) {
      return token.toString();
    } else if (typeof token === 'string') {
      return token;
    } else if (typeof token === 'symbol') {
      return token.toString();
    } else if (typeof token === 'function') {
      return token.name || 'Function';
    }
    return String(token);
  }

  /**
   * List all registered provider tokens and module class names
   */
  list(): { providers: TokenType[]; modules: string[] } {
    return {
      providers: Array.from(this.providers.keys()),
      modules: Array.from(this.modules).map(m => m.name),
    };
  }
} 