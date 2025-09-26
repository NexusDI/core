import { describe, it, expect } from 'vitest';
import { Module } from './decorators/module';
import { DynamicModule, createModuleConfig } from './dynamic-module';
import { Nexus } from './container';
import type { DynamicModuleConfig, ModuleConfig } from './types';
import { Token } from './token';

/**
 * Real-world Dynamic Module Examples
 *
 * These examples demonstrate practical usage patterns for dynamic modules
 * that users can follow in their own applications.
 */

describe('Real-world Dynamic Module Usage Examples', () => {
  // Example 1: Simple Configuration Module
  describe('Example 1: Database Configuration', () => {
    interface DatabaseConfig {
      host: string;
      port: number;
      database: string;
    }

    const DB_CONFIG_TOKEN = new Token<DatabaseConfig>('DB_CONFIG');

    @Module({})
    class DatabaseModule implements DynamicModule<DatabaseConfig> {
      configToken = DB_CONFIG_TOKEN;

      static config(
        config: DynamicModuleConfig<DatabaseConfig>
      ): ModuleConfig | Promise<ModuleConfig> {
        return createModuleConfig(this, config);
      }
    }

    it('should create sync configuration', async () => {
      const config: DatabaseConfig = {
        host: 'localhost',
        port: 5432,
        database: 'myapp',
      };

      const moduleConfig = await DatabaseModule.config(config);

      // The module config should contain a provider for the config
      expect(moduleConfig.providers).toHaveLength(1);

      const configProvider = moduleConfig.providers?.[0] as any;
      expect(configProvider.token).toBe(DB_CONFIG_TOKEN);
      expect(configProvider.useValue).toEqual(config);
    });

    it('should create async configuration', async () => {
      const config: DatabaseConfig = {
        host: 'remote-db.com',
        port: 5432,
        database: 'production',
      };

      const moduleConfig = await DatabaseModule.config(
        await Promise.resolve(config)
      );

      expect(moduleConfig.providers).toHaveLength(1);

      const configProvider = moduleConfig.providers?.[0] as any;
      expect(configProvider.token).toBe(DB_CONFIG_TOKEN);
      expect(configProvider.useValue).toEqual(config);
    });

    it('should work with container', async () => {
      const config: DatabaseConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
      };

      const moduleConfig = await DatabaseModule.config(config);
      const container = new Nexus();

      // Register the module configuration
      await container.set(moduleConfig);

      // Get the config from the container
      const resolvedConfig = await container.get(DB_CONFIG_TOKEN);
      expect(resolvedConfig).toEqual(config);
    });
  });

  // Example 3: Factory-based Configuration
  describe('Example 3: Factory Configuration', () => {
    interface LoggerConfig {
      level: 'debug' | 'info' | 'warn' | 'error';
      format: 'json' | 'text';
      outputs: string[];
    }

    const LOGGER_CONFIG_TOKEN = new Token<LoggerConfig>('LOGGER_CONFIG');

    @Module({})
    class LoggerModule implements DynamicModule<LoggerConfig> {
      configToken = LOGGER_CONFIG_TOKEN;

      static config(config: DynamicModuleConfig<LoggerConfig>) {
        return createModuleConfig(this, config);
      }
    }

    it('should work with sync factory', async () => {
      const moduleConfig = await LoggerModule.config({
        useFactory: () => ({
          level: 'info',
          format: 'json',
          outputs: ['console', 'file'],
        }),
      });

      expect(moduleConfig.providers).toHaveLength(1);

      const configProvider = moduleConfig.providers?.[0] as any;
      expect(configProvider.token).toBe(LOGGER_CONFIG_TOKEN);
      expect(configProvider.useFactory).toBeDefined();
      expect(typeof configProvider.useFactory).toBe('function');
    });

    it('should work with async factory', async () => {
      const moduleConfig = await LoggerModule.config({
        useFactory: async () => {
          // Simulate loading config from external source
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            level: 'debug' as const,
            format: 'text' as const,
            outputs: ['console'],
          };
        },
      });

      expect(moduleConfig.providers).toHaveLength(1);

      const configProvider = moduleConfig.providers?.[0] as any;
      expect(configProvider.token).toBe(LOGGER_CONFIG_TOKEN);
      expect(configProvider.useFactory).toBeDefined();
    });

    it('should resolve factory in container', async () => {
      const moduleConfig = await LoggerModule.config({
        useFactory: () => ({
          level: 'warn',
          format: 'json',
          outputs: ['file'],
        }),
      });

      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(LOGGER_CONFIG_TOKEN);
      expect(config.level).toBe('warn');
      expect(config.format).toBe('json');
      expect(config.outputs).toEqual(['file']);
    });
  });

  // Example 4: Conditional Module Registration
  describe('Example 4: Conditional Registration', () => {
    interface FeatureConfig {
      enabled: boolean;
      options: Record<string, any>;
    }

    const FEATURE_CONFIG_TOKEN = new Token<FeatureConfig>('FEATURE_CONFIG');

    @Module({})
    class FeatureModule implements DynamicModule<FeatureConfig> {
      configToken = FEATURE_CONFIG_TOKEN;

      static config(config: DynamicModuleConfig<FeatureConfig>) {
        return createModuleConfig(this, config);
      }

      static enable(
        options: Record<string, any> = {}
      ): ModuleConfig | Promise<ModuleConfig> {
        return this.config({ enabled: true, options });
      }

      static disable(): ModuleConfig | Promise<ModuleConfig> {
        return this.config({ enabled: false, options: {} });
      }

      static conditional(
        condition: boolean,
        options: Record<string, any> = {}
      ): ModuleConfig | Promise<ModuleConfig> {
        return condition ? this.enable(options) : this.disable();
      }
    }

    it('should enable feature with options', async () => {
      const options = { maxRetries: 3, timeout: 5000 };

      const container = new Nexus();
      await container.set(FeatureModule.enable(options));

      const config = await container.get(FEATURE_CONFIG_TOKEN);
      expect(config.enabled).toBe(true);
      expect(config.options).toEqual(options);
    });

    it('should disable feature', async () => {
      const container = new Nexus();
      await container.set(FeatureModule.disable());

      const config = await container.get(FEATURE_CONFIG_TOKEN);
      expect(config.enabled).toBe(false);
      expect(config.options).toEqual({});
    });

    it('should conditionally register based on environment', async () => {
      const isProduction = false;

      const container = new Nexus();
      await container.set(
        FeatureModule.conditional(isProduction, {
          debugMode: true,
        })
      );

      const config = await container.get(FEATURE_CONFIG_TOKEN);
      expect(config.enabled).toBe(false); // because isProduction is false
    });
  });

  // Example 5: Multiple Dynamic Modules
  describe('Example 5: Combining Multiple Dynamic Modules', () => {
    // Define separate config tokens and modules
    const DATABASE_TOKEN = new Token<{ host: string; port: number }>(
      'DATABASE'
    );
    const CACHE_TOKEN = new Token<{ maxSize: number; ttl: number }>('CACHE');
    const METRICS_TOKEN = new Token<{ enabled: boolean; endpoint: string }>(
      'METRICS'
    );

    @Module({})
    class DatabaseModule
      implements DynamicModule<{ host: string; port: number }>
    {
      configToken = DATABASE_TOKEN;
      static config(
        config: DynamicModuleConfig<{ host: string; port: number }>
      ) {
        return createModuleConfig(this, config);
      }
    }

    @Module({})
    class CacheModule
      implements DynamicModule<{ maxSize: number; ttl: number }>
    {
      configToken = CACHE_TOKEN;
      static config(
        config: DynamicModuleConfig<{ maxSize: number; ttl: number }>
      ) {
        return createModuleConfig(this, config);
      }
    }

    @Module({})
    class MetricsModule
      implements DynamicModule<{ enabled: boolean; endpoint: string }>
    {
      configToken = METRICS_TOKEN;
      static config(
        config: DynamicModuleConfig<{ enabled: boolean; endpoint: string }>
      ) {
        return createModuleConfig(this, config);
      }
    }

    it('should register multiple dynamic modules', async () => {
      const container = new Nexus();

      // Register all modules
      await container.setMany(
        DatabaseModule.config({
          host: 'localhost',
          port: 5432,
        }),
        CacheModule.config({
          maxSize: 1000,
          ttl: 3600,
        }),
        MetricsModule.config({
          enabled: true,
          endpoint: '/metrics',
        })
      );

      // All configurations should be available
      const db = await container.get(DATABASE_TOKEN);
      const cache = await container.get(CACHE_TOKEN);
      const metrics = await container.get(METRICS_TOKEN);

      expect(db.host).toBe('localhost');
      expect(db.port).toBe(5432);
      expect(cache.maxSize).toBe(1000);
      expect(cache.ttl).toBe(3600);
      expect(metrics.enabled).toBe(true);
      expect(metrics.endpoint).toBe('/metrics');
    });
  });

  // Example 6: Using with Class Providers
  describe('Example 6: Class-based Configuration', () => {
    interface AppConfig {
      version: string;
      environment: string;
    }

    const APP_CONFIG_TOKEN = new Token<AppConfig>('APP_CONFIG');

    class DevelopmentConfig implements AppConfig {
      version = '1.0.0-dev';
      environment = 'development';
    }

    class ProductionConfig implements AppConfig {
      version = '1.0.0';
      environment = 'production';
    }

    @Module({})
    class AppModule implements DynamicModule<AppConfig> {
      configToken = APP_CONFIG_TOKEN;

      static config(
        config: DynamicModuleConfig<AppConfig>
      ): ModuleConfig | Promise<ModuleConfig> {
        return createModuleConfig(this, config);
      }
    }

    it('should work with class provider', async () => {
      const moduleConfig = await AppModule.config({
        useClass: DevelopmentConfig,
      });
      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(APP_CONFIG_TOKEN);
      expect(config).toBeInstanceOf(DevelopmentConfig);
      expect(config.version).toBe('1.0.0-dev');
      expect(config.environment).toBe('development');
    });

    it('should work with different class providers', async () => {
      const moduleConfig = await AppModule.config({
        useClass: ProductionConfig,
      });
      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(APP_CONFIG_TOKEN);
      expect(config).toBeInstanceOf(ProductionConfig);
      expect(config.version).toBe('1.0.0');
      expect(config.environment).toBe('production');
    });
  });
});
