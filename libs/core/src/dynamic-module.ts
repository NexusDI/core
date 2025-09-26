// DynamicModule and related types moved from module.ts

import type { ModuleConfig, TokenType, ProviderConfigObject } from './types';
import {
  isProvider,
  isFactoryProvider,
  isPromise,
  isModuleClass,
  isProviderConfigObject,
  isTokenType,
  isService,
  isConstructor,
} from './guards';
import { getMetadata } from './helpers';
import { METADATA_KEYS } from './constants';

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
export interface DynamicModule<T = unknown> {
  configToken: TokenType<T>;
}

/**
 * Creates a ModuleConfig for a dynamic module from a config object, provider config, or async variant.
 *
 * Since NexusDI is async-first, this single method handles both sync and async configurations.
 *
 * @param moduleOrToken Decorated module class or config token (legacy)
 * @param config The config object, provider config, or promise
 * @returns ModuleConfig or Promise<ModuleConfig> depending on whether the config contains promises
 */
export function createModuleConfig<T>(
  moduleOrToken: any, // Decorated module class or config token (legacy)
  config:
    | T
    | ProviderConfigObject<T>
    | Promise<T>
    | ProviderConfigObject<Promise<T>>
): ModuleConfig | Promise<ModuleConfig> {
  let configToken: any;
  let moduleProviders: any[] = [];

  if (isModuleClass(moduleOrToken)) {
    // Modern usage: module class
    const moduleInstance = new moduleOrToken();
    configToken = moduleInstance.configToken;
    if (!configToken) {
      throw new Error('DynamicModule is missing configToken property');
    }
    const moduleMetadata = getMetadata(
      moduleOrToken,
      METADATA_KEYS.MODULE_METADATA
    ) as ModuleConfig;
    moduleProviders = (moduleMetadata?.providers ?? []).map((provider) => {
      if (isService(provider) || isConstructor(provider)) {
        // Use @Service token if present, else the class itself
        const serviceMeta = getMetadata(
          provider,
          METADATA_KEYS.SERVICE_METADATA
        );
        const token = serviceMeta?.token || provider;
        return { token, useClass: provider };
      }
      return provider;
    });
  } else if (isTokenType(moduleOrToken)) {
    // Legacy usage: config token
    configToken = moduleOrToken;
    moduleProviders = [];
  } else {
    throw new Error(
      'First argument to createModuleConfig must be a module class or config token'
    );
  }

  // Helper to build the providers array
  const withConfigProvider = (configProvider: any) => {
    return {
      providers: [configProvider, ...moduleProviders],
    };
  };

  // If config is a provider config object (useClass, useValue, useFactory, but not token)
  if (
    typeof config === 'object' &&
    config !== null &&
    isProviderConfigObject(config)
  ) {
    // If useValue is a promise
    if ('useValue' in config && isPromise(config.useValue)) {
      return Promise.resolve(config.useValue).then((resolved) =>
        withConfigProvider({
          ...config,
          token: configToken,
          useValue: resolved,
        })
      );
    }
    return withConfigProvider({
      ...config,
      token: configToken,
    });
  }

  // If config is a factory provider (legacy)
  if (isFactoryProvider(config)) {
    return withConfigProvider({
      ...config,
      token: configToken,
    });
  }

  // If config is a Promise
  if (isPromise(config)) {
    return Promise.resolve(config).then((resolved) =>
      withConfigProvider({
        useValue: resolved,
        token: configToken,
      })
    );
  }

  // Otherwise, it's a plain config object
  return withConfigProvider({
    useValue: config,
    token: configToken,
  });
}
