import { describe, it, expect } from 'vitest';
import { Module } from './decorators/module';
import { DynamicModule, createModuleConfig } from './dynamic-module';
import { Nexus } from './container';
import type { ModuleConfig } from './types';
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
        config: DatabaseConfig | Promise<DatabaseConfig>
      ): ModuleConfig | Promise<ModuleConfig> {
        return createModuleConfig(new this(), config);
      }

      static configAsync(
        config: Promise<DatabaseConfig>
      ): Promise<ModuleConfig> {
        return createModuleConfig(new this(), config) as Promise<ModuleConfig>;
      }
    }

    it('should create sync configuration', () => {
      const config: DatabaseConfig = {
        host: 'localhost',
        port: 5432,
        database: 'myapp',
      };

      const moduleConfig = DatabaseModule.config(config);

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

      const moduleConfig = await DatabaseModule.configAsync(
        Promise.resolve(config)
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

      const moduleConfig = DatabaseModule.config(config);
      const container = new Nexus();

      // Register the module configuration
      await await container.set(moduleConfig);

      // Get the config from the container
      const resolvedConfig = await container.get(DB_CONFIG_TOKEN);
      expect(resolvedConfig).toEqual(config);
    });
  });

  // Example 2: Environment-based Configuration
  describe('Example 2: Environment Configurations', () => {
    interface ApiConfig {
      baseUrl: string;
      timeout: number;
      apiKey?: string;
    }

    const API_CONFIG_TOKEN = new Token<ApiConfig>('API_CONFIG');

    @Module({})
    class ApiModule implements DynamicModule<ApiConfig> {
      configToken = API_CONFIG_TOKEN;

      static config(config: ApiConfig): ModuleConfig {
        return createModuleConfig(new this(), config);
      }

      // Environment-specific factory methods
      static forDevelopment(): ModuleConfig {
        return this.config({
          baseUrl: 'http://localhost:3000/api',
          timeout: 5000,
        });
      }

      static forProduction(apiKey: string): ModuleConfig {
        return this.config({
          baseUrl: 'https://api.myapp.com',
          timeout: 10000,
          apiKey,
        });
      }

      static forTesting(): ModuleConfig {
        return this.config({
          baseUrl: 'https://mock.api.com',
          timeout: 1000,
        });
      }
    }

    it('should provide development configuration', async () => {
      const moduleConfig = ApiModule.forDevelopment();
      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(API_CONFIG_TOKEN);
      expect(config.baseUrl).toBe('http://localhost:3000/api');
      expect(config.timeout).toBe(5000);
      expect(config.apiKey).toBeUndefined();
    });

    it('should provide production configuration', async () => {
      const apiKey = 'prod-api-key-123';
      const moduleConfig = ApiModule.forProduction(apiKey);
      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(API_CONFIG_TOKEN);
      expect(config.baseUrl).toBe('https://api.myapp.com');
      expect(config.timeout).toBe(10000);
      expect(config.apiKey).toBe(apiKey);
    });

    it('should provide testing configuration', async () => {
      const moduleConfig = ApiModule.forTesting();
      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(API_CONFIG_TOKEN);
      expect(config.baseUrl).toBe('https://mock.api.com');
      expect(config.timeout).toBe(1000);
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

      static config(config: LoggerConfig): ModuleConfig {
        return createModuleConfig(new this(), config);
      }

      static withFactory(factory: () => LoggerConfig): ModuleConfig {
        return createModuleConfig(new this(), { useFactory: factory });
      }

      static async configAsync(
        factory: () => Promise<LoggerConfig>
      ): Promise<ModuleConfig> {
        return createModuleConfig(new this(), { useFactory: factory });
      }
    }

    it('should work with sync factory', () => {
      const moduleConfig = LoggerModule.withFactory(() => ({
        level: 'info',
        format: 'json',
        outputs: ['console', 'file'],
      }));

      expect(moduleConfig.providers).toHaveLength(1);

      const configProvider = moduleConfig.providers?.[0] as any;
      expect(configProvider.token).toBe(LOGGER_CONFIG_TOKEN);
      expect(configProvider.useFactory).toBeDefined();
      expect(typeof configProvider.useFactory).toBe('function');
    });

    it('should work with async factory', async () => {
      const moduleConfig = await LoggerModule.configAsync(async () => {
        // Simulate loading config from external source
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          level: 'debug' as const,
          format: 'text' as const,
          outputs: ['console'],
        };
      });

      expect(moduleConfig.providers).toHaveLength(1);

      const configProvider = moduleConfig.providers?.[0] as any;
      expect(configProvider.token).toBe(LOGGER_CONFIG_TOKEN);
      expect(configProvider.useFactory).toBeDefined();
    });

    it('should resolve factory in container', async () => {
      const moduleConfig = LoggerModule.withFactory(() => ({
        level: 'warn',
        format: 'json',
        outputs: ['file'],
      }));

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

      static config(config: FeatureConfig): ModuleConfig {
        return createModuleConfig(new this(), config);
      }

      static enable(options: Record<string, any> = {}): ModuleConfig {
        return this.config({ enabled: true, options });
      }

      static disable(): ModuleConfig {
        return this.config({ enabled: false, options: {} });
      }

      static conditional(
        condition: boolean,
        options: Record<string, any> = {}
      ): ModuleConfig {
        return condition ? this.enable(options) : this.disable();
      }
    }

    it('should enable feature with options', async () => {
      const options = { maxRetries: 3, timeout: 5000 };
      const moduleConfig = FeatureModule.enable(options);

      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(FEATURE_CONFIG_TOKEN);
      expect(config.enabled).toBe(true);
      expect(config.options).toEqual(options);
    });

    it('should disable feature', async () => {
      const moduleConfig = FeatureModule.disable();

      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(FEATURE_CONFIG_TOKEN);
      expect(config.enabled).toBe(false);
      expect(config.options).toEqual({});
    });

    it('should conditionally register based on environment', async () => {
      const isProduction = false;
      const moduleConfig = FeatureModule.conditional(isProduction, {
        debugMode: true,
      });

      const container = new Nexus();
      await container.set(moduleConfig);

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
      static config(config: { host: string; port: number }) {
        return createModuleConfig(new this(), config);
      }
    }

    @Module({})
    class CacheModule
      implements DynamicModule<{ maxSize: number; ttl: number }>
    {
      configToken = CACHE_TOKEN;
      static config(config: { maxSize: number; ttl: number }) {
        return createModuleConfig(new this(), config);
      }
    }

    @Module({})
    class MetricsModule
      implements DynamicModule<{ enabled: boolean; endpoint: string }>
    {
      configToken = METRICS_TOKEN;
      static config(config: { enabled: boolean; endpoint: string }) {
        return createModuleConfig(new this(), config);
      }
    }

    it('should register multiple dynamic modules', async () => {
      const dbConfig = DatabaseModule.config({
        host: 'localhost',
        port: 5432,
      });

      const cacheConfig = CacheModule.config({
        maxSize: 1000,
        ttl: 3600,
      });

      const metricsConfig = MetricsModule.config({
        enabled: true,
        endpoint: '/metrics',
      });

      const container = new Nexus();

      // Register all modules
      await container.set(dbConfig);
      await container.set(cacheConfig);
      await container.set(metricsConfig);

      // All configurations should be available
      const db = await container.get(DATABASE_TOKEN);
      const cache = await container.get(CACHE_TOKEN);
      const metrics = await container.get(METRICS_TOKEN);

      expect(db).toEqual({ host: 'localhost', port: 5432 });
      expect(cache).toEqual({ maxSize: 1000, ttl: 3600 });
      expect(metrics).toEqual({ enabled: true, endpoint: '/metrics' });
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

      static config(config: AppConfig): ModuleConfig {
        return createModuleConfig(new this(), config);
      }

      static withClass<T extends new () => AppConfig>(
        configClass: T
      ): ModuleConfig {
        return createModuleConfig(new this(), { useClass: configClass });
      }
    }

    it('should work with class provider', async () => {
      const moduleConfig = AppModule.withClass(DevelopmentConfig);

      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(APP_CONFIG_TOKEN);
      expect(config.version).toBe('1.0.0-dev');
      expect(config.environment).toBe('development');
    });

    it('should work with different class providers', async () => {
      const moduleConfig = AppModule.withClass(ProductionConfig);

      const container = new Nexus();
      await container.set(moduleConfig);

      const config = await container.get(APP_CONFIG_TOKEN);
      expect(config.version).toBe('1.0.0');
      expect(config.environment).toBe('production');
    });
  });
});
