// DynamicModule and related types moved from module.ts

import type { ModuleConfig, TokenType, ProviderConfigObject } from './types';
import { METADATA_KEYS } from './constants';
import { getMetadata } from './helpers';
import { InvalidModule } from './exceptions/invalid-module.exception';
import { isProvider, isFactory, isPromise } from './guards';

/**
 * Represents a dynamic module, allowing for runtime configuration of providers and imports.
 *
 * @example
 * import { DynamicModule } from '@nexusdi/core';
 * const dynamic = DynamicModule.forRoot({ providers: [LoggerService] });
 * @see https://nexus.js.org/docs/modules/dynamic-modules
 */
export abstract class DynamicModule {
  static configToken: TokenType<unknown>;

  /**
   * Gets the module configuration from the decorator metadata
   */
  static getModuleConfig<T extends typeof DynamicModule>(
    this: T
  ): ModuleConfig {
    const moduleConfig = getMetadata(this, METADATA_KEYS.MODULE_METADATA);
    if (!moduleConfig) {
      throw new InvalidModule(this);
    }
    return moduleConfig;
  }

  /**
   * Returns the config token for the module
   */
  static getConfigToken<T extends typeof DynamicModule>(
    this: T
  ): TokenType<unknown> {
    return this.configToken;
  }
}

/**
 * Creates a ModuleConfig for a dynamic module from a config object, provider config, or async variant.
 *
 * @param moduleClass The module class (should have a static configToken property)
 * @param config The config object, provider config, promise, or provider config with promise
 * @returns ModuleConfig or Promise<ModuleConfig>
 */
export function createModuleConfig<T>(
  moduleClass: { configToken: TokenType<T> },
  config:
    | T
    | ProviderConfigObject<T>
    | Promise<T>
    | ProviderConfigObject<Promise<T>>
): ModuleConfig | Promise<ModuleConfig> {
  // If config is a factory provider
  if (isFactory(config)) {
    const result = config.useFactory(...(config.deps ?? []));
    if (isPromise(result)) {
      return Promise.resolve(result).then((resolved) => ({
        providers: [
          {
            useValue: resolved,
            token: moduleClass.configToken,
          },
        ],
      }));
    }
    // Sync factory
    return {
      providers: [
        {
          ...config,
          token: moduleClass.configToken,
        },
      ],
    };
  }

  // If config is a provider config (but not a factory)
  if (isProvider(config)) {
    // If useValue is a promise
    if ('useValue' in config && isPromise(config.useValue)) {
      return Promise.resolve(config.useValue).then((resolved) => ({
        providers: [
          {
            ...config,
            useValue: resolved,
            token: moduleClass.configToken,
          },
        ],
      }));
    }
    // Otherwise, sync provider config
    return {
      providers: [
        {
          ...config,
          token: moduleClass.configToken,
        },
      ],
    };
  }

  // If config is a Promise
  if (isPromise(config)) {
    return Promise.resolve(config).then((resolved) => ({
      providers: [
        {
          useValue: resolved,
          token: moduleClass.configToken,
        },
      ],
    }));
  }

  // Otherwise, it's a plain config object
  return {
    providers: [
      {
        useValue: config,
        token: moduleClass.configToken,
      },
    ],
  };
}
