// DynamicModule and related types moved from module.ts

import type { ModuleConfig, TokenType, ProviderConfigObject } from './types';
import { isProvider, isFactory, isPromise } from './guards';

/**
 * Interface for dynamic modules that allows for runtime configuration of providers and imports.
 *
 * @example
 * ```typescript
 * const DB_CONFIG_TOKEN = new Token<DatabaseConfig>('DB_CONFIG');
 *
 * @Module({})
 * class DatabaseModule implements DynamicModule<DatabaseConfig> {
 *   configToken = DB_CONFIG_TOKEN;
 *
 *   static async config(config: DatabaseConfig | Promise<DatabaseConfig>) {
 *     return await createModuleConfig(new this(), config);
 *   }
 * }
 * ```
 * @see https://nexus.js.org/docs/modules/dynamic-modules
 */
export interface DynamicModule<T = any> {
  configToken: TokenType<T>;
}

/**
 * Creates a ModuleConfig for a dynamic module from a config object, provider config, or async variant.
 *
 * Since NexusDI is async-first, this single method handles both sync and async configurations.
 *
 * @param moduleInstance The module instance (should have a configToken property)
 * @param config The config object, provider config, or promise
 * @returns ModuleConfig or Promise<ModuleConfig> depending on whether the config contains promises
 */
export function createModuleConfig<T>(
  moduleInstance: { configToken: TokenType<T> },
  config:
    | T
    | ProviderConfigObject<T>
    | Promise<T>
    | ProviderConfigObject<Promise<T>>
): ModuleConfig | Promise<ModuleConfig> {
  // If config is a factory provider
  if (isFactory(config)) {
    // Don't execute the factory here - let the DI container handle it
    // Just pass the factory configuration through with the token
    return {
      providers: [
        {
          ...config,
          token: moduleInstance.configToken,
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
            token: moduleInstance.configToken,
          },
        ],
      }));
    }
    // Otherwise, sync provider config
    return {
      providers: [
        {
          ...config,
          token: moduleInstance.configToken,
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
          token: moduleInstance.configToken,
        },
      ],
    }));
  }

  // Otherwise, it's a plain config object
  return {
    providers: [
      {
        useValue: config,
        token: moduleInstance.configToken,
      },
    ],
  };
}
