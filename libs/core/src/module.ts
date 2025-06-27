/* eslint-disable @typescript-eslint/no-explicit-any */
import { Module } from './decorators';
import type { ModuleConfig, TokenType } from './types';
import { METADATA_KEYS } from './constants';
import type { Token } from './token';
import { setMetadata, getMetadata } from './helpers';
import { InvalidModule } from './exceptions/invalid-module.exception';

/**
 * Represents a dynamic module, allowing for runtime configuration of providers and imports.
 *
 * @example
 * import { DynamicModule } from '@nexusdi/core';
 * const dynamic = DynamicModule.forRoot({ providers: [LoggerService] });
 * @see https://nexus.js.org/docs/modules/dynamic-modules
 */
export abstract class DynamicModule<TConfig = any> {
  protected abstract readonly configToken: Token<TConfig> | string | symbol;

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
  static getConfigToken<T extends typeof DynamicModule>(this: T): TokenType {
    // Cast to a constructor type that has a parameterless constructor and configToken property
    type WithConfigToken = { new (): { configToken: TokenType } };
    return new (this as unknown as WithConfigToken)().configToken;
  }

  /**
   * Creates a dynamic module configuration with the provided config
   */
  static config<T extends typeof DynamicModule, TConfig>(
    this: T,
    config: TConfig
  ) {
    const moduleConfig = this.getModuleConfig();
    const configToken = this.getConfigToken();
    return {
      ...moduleConfig,
      providers: [
        ...(moduleConfig.providers || []),
        { token: configToken, useValue: config },
      ],
    };
  }

  /**
   * Creates a dynamic module configuration with an async config factory
   */
  static configAsync<T extends typeof DynamicModule, TConfig>(
    this: T,
    configFactory: () => TConfig | Promise<TConfig>
  ) {
    const moduleConfig = this.getModuleConfig();
    const configToken = this.getConfigToken();
    return {
      ...moduleConfig,
      providers: [
        ...(moduleConfig.providers || []),
        { token: configToken, useFactory: configFactory },
      ],
    };
  }

  /**
   * Create a dynamic module with the given configuration.
   *
   * @param config Module configuration
   * @returns A dynamic module class
   * @example
   * import { DynamicModule } from '@nexusdi/core';
   * const MyDynamic = DynamicModule.forRoot({ providers: [LoggerService] });
   * @see https://nexus.js.org/docs/modules/dynamic-modules
   */
  static forRoot(config: any): any {
    class RuntimeDynamicModule {}
    setMetadata(RuntimeDynamicModule, METADATA_KEYS.MODULE_METADATA, config);
    return RuntimeDynamicModule;
  }
}

// Re-export the Module decorator for convenience
export { Module };
