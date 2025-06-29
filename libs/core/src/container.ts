/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  TokenType,
  Provider,
  IContainer,
  InjectionMetadata,
  ModuleProvider,
  Constructor,
  InternalProvider,
  InternalClassProvider,
  ProviderConfigObject,
} from './types';
import { METADATA_KEYS } from './constants';
import { getMetadata } from './helpers';
import {
  isTokenType,
  isConstructor,
  isModuleConfig,
  isProvider,
} from './guards';
import {
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
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
  // Map of all registered providers (tokens to provider definitions).
  // Used to look up how to construct or resolve a dependency.
  private providers = new Map<TokenType, Provider<any>>();

  // Map of instantiated singletons or cached instances (tokens to instance).
  // Ensures that singleton and cached providers are only created once and reused.
  private instances = new Map<TokenType, any>();

  // Set of all registered module classes.
  // Used to track which modules have been loaded to prevent duplicate registration and support module-level features.
  private modules = new Set<Constructor<any>>();

  // Map of token aliases (alias token to canonical token).
  // Allows multiple tokens to refer to the same provider/instance, supporting aliasing and token indirection.
  private aliases = new Map<TokenType, TokenType>();

  // Set of modules currently being instantiated.
  // Used to detect and prevent circular dependencies during module resolution.
  private inProgressModules = new Set<Constructor<any>>();

  /**
   * Resolve the actual token, handling aliases and type checks.
   * Throws if the token is invalid.
   */
  private getToken<T>(token: TokenType<T>): TokenType<T> {
    if (!isTokenType(token)) {
      throw new InvalidToken(token);
    }
    return this.aliases.get(token) || token;
  }

  /**
   * Check if a resolved token is registered in the container.
   * Used internally to avoid redundant getToken calls.
   */
  private hasToken(actualToken: TokenType<unknown>): boolean {
    return (
      this.providers.has(actualToken) ||
      this.modules.has(actualToken as Constructor<any>)
    );
  }

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
    const actualToken = this.getToken(token);
    if (!this.hasToken(actualToken)) {
      throw new NoProvider(token);
    }
    const provider = this.providers.get(actualToken);
    if (!provider) {
      throw new NoProvider(token);
    }

    if (this.instances.has(actualToken)) {
      return this.instances.get(actualToken);
    }

    const instance = this.resolveProvider(provider as InternalProvider<T>);
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
    try {
      return this.hasToken(this.getToken(token));
    } catch {
      return false;
    }
  }

  /**
   * Resolve a class constructor, resolving all dependencies.
   * @param provider The class to resolve dependencies for
   * @returns The resolved instance
   * @see https://nexus.js.org/docs/container/nexus-class
   */
  resolve<T>(provider: Constructor<T>): T {
    if (!isConstructor(provider)) {
      throw new InvalidToken(
        `Cannot instantiate non-class token: ${this.tokenToString(provider)}`
      );
    }
    const paramTypes =
      getMetadata(provider, METADATA_KEYS.DESIGN_PARAMTYPES) || [];
    const ctorInjectionMetadata: InjectionMetadata[] =
      getMetadata(provider, METADATA_KEYS.INJECT_METADATA) || [];
    const propInjectionMetadata: InjectionMetadata[] =
      getMetadata(provider.prototype, METADATA_KEYS.INJECT_METADATA) || [];
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
    const instance = new (provider as Constructor<T>)(...params);
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
  set<T>(token: TokenType<T>, provider: ProviderConfigObject<T>): void;
  set<T>(token: TokenType<T>, serviceClass: Constructor<T>): void;
  set<T>(moduleClass: Constructor<T>): void;
  set(moduleConfig: {
    providers?: ModuleProvider[];
    imports?: Constructor[];
    exports?: TokenType[];
  }): void;
  set(tokenOrModuleOrConfig: any, providerOrNothing?: any): void {
    if (tokenOrModuleOrConfig === providerOrNothing) {
      console.warn('[Nexus]: Both token and provider are the same.');
    }
    if (
      isConstructor(tokenOrModuleOrConfig) &&
      getMetadata(tokenOrModuleOrConfig, METADATA_KEYS.MODULE_METADATA)
    ) {
      if (
        this.inProgressModules.has(tokenOrModuleOrConfig) ||
        this.modules.has(tokenOrModuleOrConfig)
      ) {
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
    if (isModuleConfig(tokenOrModuleOrConfig)) {
      this.processModuleConfig(tokenOrModuleOrConfig);
      return;
    }
    this.setProvider(tokenOrModuleOrConfig, providerOrNothing);
  }

  private normalizeProvider<T>(
    input: Provider<T> | Constructor<T>
  ): InternalProvider<T> {
    if (isConstructor(input)) {
      return this.normalizeClassProvider(input);
    }

    if (!isProvider(input)) throw new InvalidProvider(JSON.stringify(input));

    if ('useClass' in input && isConstructor(input.useClass)) {
      return { ...input, type: 'class' };
    }

    if ('useFactory' in input && typeof input.useFactory === 'function') {
      return { ...input, type: 'factory' };
    }

    if ('useValue' in input) {
      return { ...input, type: 'value' };
    }
    throw new InvalidProvider(JSON.stringify(input));
  }

  private normalizeClassProvider<T>(
    input: Constructor<T>
  ): InternalClassProvider<T> {
    const providerConfig = getMetadata(input, METADATA_KEYS.PROVIDER_METADATA);
    if (!providerConfig) {
      throw new InvalidProvider(input);
    }
    const token: TokenType<T> = this.getToken(
      providerConfig.token || (input as TokenType<any>)
    );
    return { token, useClass: input, type: 'class' };
  }

  private resolveProvider<T>(provider: InternalProvider<T>): T {
    switch (provider.type) {
      case 'class':
        return this.resolve(provider.useClass);
      case 'value':
        return provider.useValue;
      case 'factory': {
        const deps = provider.deps?.map((dep) => this.get(dep)) || [];
        return provider.useFactory(...deps);
      }
      default:
        throw new InvalidProvider('Invalid provider type');
    }
  }

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
        const normProvider = this.normalizeProvider(provider as any);
        this.setProvider(normProvider.token, normProvider);
      }
    }
  }

  private setProvider<T>(
    tokenOrClass: TokenType<T> | Constructor<T>,
    providerOrNothing?: Provider<T> | Constructor<T>
  ): void {
    let token: TokenType<any>;
    let provider: InternalProvider<any>;

    if (providerOrNothing == null) {
      provider = this.normalizeProvider(tokenOrClass as any);
      token = provider.token;
    } else if (isConstructor(providerOrNothing)) {
      // (token, class) registration
      const providerObj = {
        token: tokenOrClass,
        useClass: providerOrNothing,
      };
      provider = this.normalizeProvider(providerObj);
      token = provider.token;
    } else {
      // (token, provider object) registration
      const providerWithToken = Object.assign({}, providerOrNothing, {
        token: tokenOrClass,
      });
      provider = this.normalizeProvider(providerWithToken);
      token = provider.token;
    }

    this.providers.set(token, provider);
    this.instances.delete(token);

    for (const [alias, target] of this.aliases.entries()) {
      if (target === token) {
        this.instances.delete(alias);
      }
    }
    if (provider.type === 'class' && token !== provider.useClass) {
      this.aliases.set(provider.useClass, token);
      this.instances.delete(provider.useClass);
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
