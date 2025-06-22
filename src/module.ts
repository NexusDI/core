import { Module } from './decorators';
import type { ModuleConfig, TokenType } from './types';
import { METADATA_KEYS } from './types';
import type { Token } from './token';

/**
 * Abstract base class for dynamic modules that automatically provides
 * config() and configAsync() methods.
 */
export abstract class DynamicModule<TConfig = any> {
  protected abstract readonly configToken: Token<TConfig> | string | symbol;

  /**
   * Gets the module configuration from the decorator metadata
   */
  static getModuleConfig<T extends typeof DynamicModule>(this: T): ModuleConfig {
    const moduleConfig = Reflect.getMetadata(METADATA_KEYS.MODULE_METADATA, DynamicModule);
    if (!moduleConfig) {
      throw new Error(`Module ${DynamicModule.name} is not properly decorated with @Module`);
    }
    return moduleConfig;
  }

  /**
   * Returns the config token for the module
   */
  static getConfigToken<T extends typeof DynamicModule>(this: T): TokenType {
    // Cast to a constructor type that has a parameterless constructor and configToken property
    type WithConfigToken = { new (): { configToken: TokenType } };
    return new (DynamicModule as unknown as WithConfigToken)().configToken;
  }

  /**
   * Creates a dynamic module configuration with the provided config
   */
  static config<T extends typeof DynamicModule, TConfig>(
    this: T,
    config: TConfig
  ) {
    const moduleConfig = DynamicModule.getModuleConfig();
    const configToken = DynamicModule.getConfigToken();
    return {
      ...moduleConfig,
      providers: [
        ...(moduleConfig.providers || []),
        { token: configToken, useValue: config }
      ]
    };
  }

  /**
   * Creates a dynamic module configuration with an async config factory
   */
  static configAsync<T extends typeof DynamicModule, TConfig>(
    this: T,
    configFactory: () => TConfig | Promise<TConfig>
  ) {
    const moduleConfig = DynamicModule.getModuleConfig();
    const configToken = DynamicModule.getConfigToken();
    return {
      ...moduleConfig,
      providers: [
        ...(moduleConfig.providers || []),
        { token: configToken, useFactory: configFactory }
      ]
    };
  }
}

// Re-export the Module decorator for convenience
export { Module }; 