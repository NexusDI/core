// DynamicModule and related types moved from module.ts

import type { ModuleConfig, TokenType, ProviderConfigObject } from './types';
import { METADATA_KEYS } from './constants';
import { getMetadata } from './helpers';
import { InvalidModule } from './exceptions/invalid-module.exception';
import { isProvider, isFactory } from './guards';

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
 * Creates a ModuleConfig for a dynamic module from a config object or provider config.
 *
 * @param moduleClass The module class (should have a static configToken property)
 * @param config The config object or provider config
 * @returns ModuleConfig
 */
export function createModuleConfig<T>(
  moduleClass: { configToken: TokenType<T> },
  config: T | ProviderConfigObject<T>
): ModuleConfig {
  const provider = isProvider(config)
    ? (config as ProviderConfigObject<T>)
    : { useValue: config };
  return {
    providers: [
      {
        ...provider,
        token: moduleClass.configToken,
      },
    ],
  };
}

/**
 * Creates a ModuleConfig for a dynamic module from an async config object or provider config.
 *
 * @param moduleClass The module class (should have a static configToken property)
 * @param config The async config object or provider config
 * @returns Promise<ModuleConfig>
 */
export async function createModuleConfigAsync<T>(
  moduleClass: { configToken: TokenType<T> },
  config: ProviderConfigObject<Promise<T>> | Promise<T>
): Promise<ModuleConfig> {
  if (isFactory(config)) {
    const value = await config.useFactory(...(config.deps ?? []));
    return {
      providers: [
        {
          useValue: value,
          token: moduleClass.configToken,
        },
      ],
    };
  }
  // If config is a Promise, wrap in useValue provider
  if (typeof (config as any).then === 'function') {
    return {
      providers: [
        {
          useValue: await config,
          token: moduleClass.configToken,
        },
      ],
    };
  }
  // Otherwise, treat as provider config
  return {
    providers: [
      {
        ...(config as ProviderConfigObject<Promise<T>>),
        token: moduleClass.configToken,
      },
    ],
  };
}
