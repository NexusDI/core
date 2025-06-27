/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  TokenType,
  Provider,
  IContainer,
  InjectionMetadata,
  ModuleProvider,
  Constructor,
} from './types';
import { METADATA_KEYS } from './constants';
import { getMetadata } from './helpers';
import { isTokenType, isProvider, isConstructor } from './guards';
import {
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
  InvalidService,
} from './exceptions';

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
  private modules = new Set<Constructor<any>>();
  private aliases = new Map<TokenType, TokenType>();
  private inProgressModules = new Set<Constructor<any>>();

  /**
   * Get an instance of a service or provider by token.
   * @param token The token to resolve
   * @returns The resolved instance
   * @example
   * import { Nexus } from '@nexusdi/core';
   * const logger = container.get(LoggerService);
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  get<T>(token: TokenType<T>): T {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    const actualToken = this.aliases.get(token) || token;
    if (!this.has(actualToken)) {
      throw new NoProvider(token);
    }
    const provider = this.providers.get(actualToken);
    if (!provider) {
      throw new NoProvider(token);
    }
    if (this.instances.has(actualToken)) {
      return this.instances.get(actualToken);
    }
    let instance: T;
    if (provider.useValue !== undefined) {
      instance = provider.useValue;
    } else if (provider.useFactory) {
      const deps = provider.deps?.map((dep) => this.get(dep as any)) || [];
      instance = provider.useFactory(...deps);
    } else if (provider.useClass) {
      instance = this.resolve(provider.useClass);
    } else {
      throw new InvalidProvider(
        `Invalid provider configuration for token: ${this.tokenToString(token)}`
      );
    }
    this.instances.set(actualToken, instance);
    return instance;
  }

  /**
   * Check if a token is registered in the container.
   * @param token The token to check
   * @returns True if registered
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  has(token: TokenType<unknown>): boolean {
    const actualToken = this.aliases.get(token) || token;
    return (
      this.providers.has(actualToken) ||
      this.modules.has(actualToken as Constructor<any>)
    );
  }

  /**
   * Resolve a service or provider by token (alias for get).
   * @param token The token to resolve
   * @returns The resolved instance
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  resolve<T>(token: TokenType<T>): T {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    const paramTypes =
      getMetadata(token, METADATA_KEYS.DESIGN_PARAMTYPES) || [];
    const ctorInjectionMetadata: InjectionMetadata[] =
      getMetadata(token, METADATA_KEYS.INJECT_METADATA) || [];
    let propInjectionMetadata: InjectionMetadata[] = [];
    if (typeof token === 'function') {
      propInjectionMetadata =
        getMetadata(token.prototype, METADATA_KEYS.INJECT_METADATA) || [];
    }
    const params: any[] = new Array(paramTypes.length);
    for (const metadata of ctorInjectionMetadata) {
      if (metadata.propertyKey === undefined) {
        params[metadata.index] = this.get(metadata.token);
      }
    }
    for (let i = 0; i < paramTypes.length; i++) {
      if (params[i] === undefined) {
        const paramType = paramTypes[i];
        if (paramType && paramType !== Object) {
          if (this.has(paramType)) {
            params[i] = this.get(paramType);
          } else {
            params[i] = this.resolve(paramType);
          }
        }
      }
    }
    if (typeof token !== 'function') {
      throw new InvalidToken(
        `Cannot instantiate non-class token: ${this.tokenToString(token)}`
      );
    }
    const instance = new (token as Constructor<T>)(...params);
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
  set<T>(token: TokenType<T>, provider: Provider<T>): void;
  set<T>(token: TokenType<T>, serviceClass: Constructor<T>): void;
  set<T>(moduleClass: Constructor<T>): void;
  set(moduleConfig: {
    providers?: ModuleProvider[];
    imports?: Constructor[];
    exports?: TokenType[];
  }): void;
  set(tokenOrModuleOrConfig: any, providerOrNothing?: any): void {
    if (
      typeof tokenOrModuleOrConfig === 'function' &&
      getMetadata(tokenOrModuleOrConfig, METADATA_KEYS.MODULE_METADATA)
    ) {
      if (this.inProgressModules.has(tokenOrModuleOrConfig)) {
        return;
      }
      if (this.modules.has(tokenOrModuleOrConfig)) {
        return;
      }
      this.inProgressModules.add(tokenOrModuleOrConfig);
      this.modules.add(tokenOrModuleOrConfig);
      const moduleConfig = getMetadata(
        tokenOrModuleOrConfig,
        METADATA_KEYS.MODULE_METADATA
      );
      if (!moduleConfig) {
        this.inProgressModules.delete(tokenOrModuleOrConfig);
        throw new InvalidModule(tokenOrModuleOrConfig);
      }
      this.processModuleConfig(moduleConfig);
      this.inProgressModules.delete(tokenOrModuleOrConfig);
      return;
    }
    if (
      tokenOrModuleOrConfig &&
      typeof tokenOrModuleOrConfig === 'object' &&
      (tokenOrModuleOrConfig.providers || tokenOrModuleOrConfig.imports)
    ) {
      this.processModuleConfig(tokenOrModuleOrConfig);
      return;
    }
    this.setProvider(tokenOrModuleOrConfig, providerOrNothing);
  }

  /**
   * Normalize a class or provider object into a { token, provider } pair.
   * Ensures all registrations are consistent and robust.
   */
  private normalizeProvider<T>(input: Provider<T> | Constructor<T>): {
    token: TokenType<T>;
    provider: Provider<T>;
  } {
    if (isConstructor(input)) {
      // Class registration
      const providerConfig = getMetadata(
        input,
        METADATA_KEYS.PROVIDER_METADATA
      );
      if (!providerConfig) {
        throw new InvalidService(input);
      }
      const token = providerConfig.token || (input as TokenType<T>);
      return { token, provider: { useClass: input } };
    } else if (isProvider(input)) {
      // Provider object registration
      if ('token' in input && input.token) {
        return { token: input.token as TokenType<T>, provider: input };
      } else {
        throw new InvalidProvider('Provider object must have a token');
      }
    } else {
      throw new InvalidProvider('Invalid provider type');
    }
  }

  /**
   * Internal: Register a provider (class, value, or factory) for a token.
   */
  private setProvider<T>(
    tokenOrClass: TokenType<T> | Constructor<T>,
    providerOrNothing?: Provider<T>
  ): void {
    let token: TokenType<any>;
    let provider: Provider<any>;
    if (providerOrNothing !== undefined) {
      if (!isTokenType(tokenOrClass)) {
        throw new InvalidToken(tokenOrClass);
      }
      if (isConstructor(providerOrNothing)) {
        // (token, class) registration
        const providerObj = {
          token: tokenOrClass,
          useClass: providerOrNothing,
        };
        ({ token, provider } = this.normalizeProvider(providerObj));
      } else if (
        providerOrNothing &&
        (providerOrNothing.useClass ||
          providerOrNothing.useValue ||
          providerOrNothing.useFactory)
      ) {
        // (token, provider object) registration
        const providerWithToken = Object.assign({}, providerOrNothing, {
          token: tokenOrClass,
        });
        ({ token, provider } = this.normalizeProvider(providerWithToken));
      } else {
        throw new InvalidProvider(
          'Invalid provider type. Only class constructors, symbols, or Token<T> instances are allowed as providers.'
        );
      }
    } else {
      ({ token, provider } = this.normalizeProvider(tokenOrClass as any));
    }
    this.providers.set(token, provider);
    this.instances.delete(token);
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
    providers?: ModuleProvider[];
    imports?: Constructor[];
    exports?: TokenType[];
  }): void {
    if (moduleConfig.imports) {
      for (const importedModule of moduleConfig.imports) {
        this.set(importedModule);
      }
    }
    if (moduleConfig.providers) {
      for (const provider of moduleConfig.providers) {
        const { token, provider: normProvider } = this.normalizeProvider(
          provider as any
        );
        this.setProvider(
          token as TokenType<any>,
          normProvider as Provider<any>
        );
      }
    }
  }

  /**
   * Create a child container that inherits from this container
   */
  createChildContainer(): Nexus {
    const child = new Nexus();
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
    if (typeof token === 'object' && token && 'toString' in token) {
      return token.toString();
    } else if (typeof token === 'symbol') {
      return (token as unknown as object).toString();
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
      modules: Array.from(this.modules).map((m) => m.name),
    };
  }
}
