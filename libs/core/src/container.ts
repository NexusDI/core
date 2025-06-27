/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  TokenType,
  Provider,
  IContainer,
  InjectionMetadata,
  ModuleProvider,
} from './types';
import { Token } from './token';
import { METADATA_KEYS } from './constants';
import { getMetadata } from './helpers';
import {
  isTokenType,
  isProvider,
  isFactory,
  isService,
  isContainer,
} from './guards';

/**
 * The main DI container class for NexusDI. Use this to bootstrap and resolve your modules and services.
 *
 * @example
 * import { Nexus } from '@nexusdi/core';
 * const container = new Nexus(AppModule);
 * const logger = container.get(LoggerService);
 * @see https://nexus.js.org/docs/container/nexus-class
 */
export class Nexus implements IContainer {
  private providers = new Map<TokenType, Provider>();
  private instances = new Map<TokenType, any>();
  private modules = new Set<new (...args: any[]) => any>();
  private aliases = new Map<TokenType, TokenType>();
  private inProgressModules = new Set<new (...args: any[]) => any>();

  /**
   * Get an instance of a service or provider by token.
   * @param token The token to resolve
   * @returns The resolved instance
   * @example
   * import { Nexus } from '@nexusdi/core';
   * const logger = container.get(LoggerService);
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  get<T>(token: Token<T>): T;
  get<T>(token: symbol): T;
  get<T>(token: new (...args: any[]) => T): T;
  get<T>(token: any): T {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    // Resolve aliases
    const actualToken = this.aliases.get(token) || token;
    if (!this.has(actualToken)) {
      throw new Error(
        `No provider found for token: ${this.tokenToString(token)}`
      );
    }

    const provider = this.providers.get(actualToken);
    if (!provider) {
      throw new Error(
        `No provider found for token: ${this.tokenToString(token)}`
      );
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
      const deps = provider.deps?.map((dep) => this.get(dep as any)) || [];
      instance = provider.useFactory(...deps);
    } else if (provider.useClass) {
      instance = this.resolve(provider.useClass);
    } else {
      throw new Error(
        `Invalid provider configuration for token: ${this.tokenToString(token)}`
      );
    }

    // Store singleton instance for all provider types
    this.instances.set(actualToken, instance);

    return instance;
  }

  /**
   * Check if a token is registered in the container.
   * @param token The token to check
   * @returns True if registered
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  has(token: Token<any>): boolean;
  has(token: symbol): boolean;
  has(token: new (...args: any[]) => any): boolean;
  has(token: any): boolean {
    const actualToken = this.aliases.get(token) || token;
    return (
      this.providers.has(actualToken) ||
      this.modules.has(actualToken as new (...args: any[]) => any)
    );
  }

  /**
   * Resolve a service or provider by token (alias for get).
   * @param token The token to resolve
   * @returns The resolved instance
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  resolve<T>(token: Token<T>): T;
  resolve<T>(token: symbol): T;
  resolve<T>(token: new (...args: any[]) => T): T;
  resolve<T>(token: any): T {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    const paramTypes =
      getMetadata(token, METADATA_KEYS.DESIGN_PARAMTYPES) || [];
    const ctorInjectionMetadata: InjectionMetadata[] =
      getMetadata(token, METADATA_KEYS.INJECT_METADATA) || [];
    const propInjectionMetadata: InjectionMetadata[] =
      getMetadata(token.prototype, METADATA_KEYS.INJECT_METADATA) || [];

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
    if (typeof token !== 'function') {
      throw new Error(
        `Cannot instantiate non-class token: ${this.tokenToString(token)}`
      );
    }
    const instance = new (token as new (...args: any[]) => T)(...params);

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
  set<T>(token: Token<T>, provider: Provider<T>): void;
  set<T>(token: Token<T>, serviceClass: new (...args: any[]) => T): void;
  set<T>(token: symbol, provider: Provider<T>): void;
  set<T>(token: symbol, serviceClass: new (...args: any[]) => T): void;
  set<T>(token: new (...args: any[]) => T, provider: Provider<T>): void;
  set<T>(
    token: new (...args: any[]) => T,
    serviceClass: new (...args: any[]) => T
  ): void;
  set(moduleClass: new (...args: any[]) => any): void;
  set(moduleConfig: {
    providers?: ModuleProvider[];
    imports?: (new (...args: any[]) => any)[];
    services?: (new (...args: any[]) => any)[];
    exports?: TokenType[];
  }): void;
  set(tokenOrModuleOrConfig: any, providerOrNothing?: any): void {
    // If it's a module class (has @Module metadata)
    if (
      typeof tokenOrModuleOrConfig === 'function' &&
      getMetadata(tokenOrModuleOrConfig, METADATA_KEYS.MODULE_METADATA)
    ) {
      if (this.inProgressModules.has(tokenOrModuleOrConfig)) {
        return;
      }
      if (this.modules.has(tokenOrModuleOrConfig)) {
        return; // Module already registered
      }
      this.inProgressModules.add(tokenOrModuleOrConfig);
      this.modules.add(tokenOrModuleOrConfig);
      const moduleConfig = getMetadata(
        tokenOrModuleOrConfig,
        METADATA_KEYS.MODULE_METADATA
      );
      if (!moduleConfig) {
        this.inProgressModules.delete(tokenOrModuleOrConfig);
        throw new Error(
          `Module ${tokenOrModuleOrConfig.name} is not properly decorated with @Module`
        );
      }
      this.processModuleConfig(moduleConfig);
      this.inProgressModules.delete(tokenOrModuleOrConfig);
      return;
    }
    // If it's a dynamic module config (object with services/providers/imports)
    if (
      tokenOrModuleOrConfig &&
      typeof tokenOrModuleOrConfig === 'object' &&
      (tokenOrModuleOrConfig.services ||
        tokenOrModuleOrConfig.providers ||
        tokenOrModuleOrConfig.imports)
    ) {
      this.processModuleConfig(tokenOrModuleOrConfig);
      return;
    }
    // Otherwise, treat as provider registration
    this.setProvider(tokenOrModuleOrConfig, providerOrNothing);
  }

  /**
   * Internal: Register a provider (class, value, or factory) for a token.
   */
  private setProvider(
    token: TokenType<any>,
    providerOrClass: Provider<any> | (new (...args: any[]) => any)
  ): void {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    let provider: Provider<any>;
    if (typeof providerOrClass === 'function') {
      provider = { useClass: providerOrClass };
    } else {
      provider = providerOrClass;
    }
    this.providers.set(token, provider);
    this.instances.delete(token);
    // Clear all aliases that point to this token
    for (const [alias, target] of this.aliases.entries()) {
      if (target === token) {
        this.instances.delete(alias);
      }
    }
    if (provider.useClass && token !== provider.useClass) {
      this.aliases.set(provider.useClass, token);
      this.instances.delete(provider.useClass);
    }
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
        this.set(importedModule);
      }
    }

    // Register services
    if (moduleConfig.services) {
      for (const serviceClass of moduleConfig.services) {
        const serviceConfig = getMetadata(
          serviceClass,
          METADATA_KEYS.SERVICE_METADATA
        );
        if (!serviceConfig) {
          throw new Error(
            `Service class ${serviceClass.name} is not decorated with @Service`
          );
        }
        this.set(serviceConfig.token as TokenType<any>, {
          useClass: serviceClass,
        });
      }
    }

    // Register providers
    if (moduleConfig.providers) {
      for (const provider of moduleConfig.providers) {
        // Check if provider is a service class (has @Service decorator)
        if (isService(provider)) {
          const serviceConfig = getMetadata(
            provider,
            METADATA_KEYS.SERVICE_METADATA
          );
          if (serviceConfig) {
            this.set(serviceConfig.token as TokenType<any>, {
              useClass: provider,
            });
          } else {
            throw new Error(
              `Service class ${provider.name} is not decorated with @Service`
            );
          }
        } else if (isProvider(provider)) {
          // Full provider object
          this.set(provider.token as TokenType<any>, provider);
        } else {
          throw new Error('Invalid provider type');
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
      // TypeScript sometimes thinks token is never here, so cast to object
      return (token as object).toString();
    } else if (typeof token === 'function') {
      return token.name || 'Function';
    }
    // Fallback for unknown/never types
    return String(token);
  }

  /**
   * List all registered provider tokens and module class names
   */
  list(): { providers: TokenType[]; modules: string[] } {
    return {
      providers: Array.from(this.providers.keys()),
      modules: Array.from(this.modules).map((m) => m.name),
    };
  }
}

export class ContainerException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContainerException';
  }
}

export class InvalidToken extends ContainerException {
  constructor(token: any) {
    super(
      `Invalid token: ${String(
        token
      )}. Only class constructors, symbols, or Token<T> instances are allowed as tokens.`
    );
    this.name = 'InvalidToken';
  }
}
