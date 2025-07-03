import { describe, it, expect, beforeEach } from 'vitest';
import { Optional } from './optional';
import { Inject } from './inject';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';
import type { InjectionMetadata } from '../types';

describe('@Optional decorator', () => {
  let LoggerToken: Token<{ log: (msg: string) => void }>;
  let ConfigToken: Token<{ apiUrl?: string }>;
  let PluginToken: Token<any>;

  beforeEach(() => {
    LoggerToken = new Token<{ log: (msg: string) => void }>('Logger');
    ConfigToken = new Token<{ apiUrl?: string }>('Config');
    PluginToken = new Token('Plugin');
  });

  describe('Constructor parameter injection (primary usage)', () => {
    it('should mark a logger dependency as optional', () => {
      class UserService {
        constructor(
          @Optional(LoggerToken) private logger?: { log: (msg: string) => void }
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(UserService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: LoggerToken,
        propertyKey: undefined,
        index: 0,
        optional: true,
      });
    });

    it('should mark configuration as optional for service with fallback values', () => {
      class DatabaseService {
        constructor(
          @Optional(ConfigToken) private config?: { apiUrl?: string }
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(DatabaseService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: ConfigToken,
        propertyKey: undefined,
        index: 0,
        optional: true,
      });
    });

    it('should handle multiple optional dependencies', () => {
      const CacheToken = new Token('Cache');
      const MetricsToken = new Token('Metrics');

      class ApiService {
        constructor(
          @Optional(LoggerToken)
          private logger?: { log: (msg: string) => void },
          @Optional(CacheToken) private cache?: any,
          @Optional(MetricsToken) private metrics?: any
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(ApiService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(3);
      expect(metadata.find((m) => m.index === 0)?.token).toBe(LoggerToken);
      expect(metadata.find((m) => m.index === 0)?.optional).toBe(true);
      expect(metadata.find((m) => m.index === 1)?.token).toBe(CacheToken);
      expect(metadata.find((m) => m.index === 1)?.optional).toBe(true);
      expect(metadata.find((m) => m.index === 2)?.token).toBe(MetricsToken);
      expect(metadata.find((m) => m.index === 2)?.optional).toBe(true);
    });

    it('should work with class constructor tokens', () => {
      class PluginManager {}

      class ExtensibleService {
        constructor(@Optional(PluginManager) private plugins?: PluginManager) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(ExtensibleService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: PluginManager,
        propertyKey: undefined,
        index: 0,
        optional: true,
      });
    });
  });

  describe('Property injection', () => {
    it('should mark a property as optional', () => {
      class UserService {
        @Optional(LoggerToken)
        private logger?: { log: (msg: string) => void };
      }

      const metadata: InjectionMetadata[] =
        getMetadata(UserService.prototype, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: LoggerToken,
        propertyKey: 'logger',
        index: 0,
        optional: true,
      });
    });

    it('should handle optional plugin system', () => {
      class ExtensibleApp {
        @Optional(PluginToken)
        private analytics?: any;

        @Optional(PluginToken)
        private monitoring?: any;
      }

      const metadata: InjectionMetadata[] =
        getMetadata(ExtensibleApp.prototype, METADATA_KEYS.INJECT_METADATA) ||
        [];

      expect(metadata).toHaveLength(2);
      expect(metadata[0]).toEqual({
        token: PluginToken,
        propertyKey: 'analytics',
        index: 0,
        optional: true,
      });
      expect(metadata[1]).toEqual({
        token: PluginToken,
        propertyKey: 'monitoring',
        index: 0,
        optional: true,
      });
    });

    it('should handle symbol property keys', () => {
      const loggerSymbol = Symbol('logger');

      class TestClass {
        @Optional(LoggerToken)
        [loggerSymbol]?: { log: (msg: string) => void };
      }

      const metadata: InjectionMetadata[] =
        getMetadata(TestClass.prototype, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: LoggerToken,
        propertyKey: loggerSymbol,
        index: 0,
        optional: true,
      });
    });
  });

  describe('Real-world patterns', () => {
    it('should support services that gracefully degrade without optional dependencies', () => {
      const TelemetryToken = new Token('Telemetry');
      const CacheToken = new Token('Cache');

      class EmailService {
        constructor(
          @Optional(LoggerToken)
          private logger?: { log: (msg: string) => void },
          @Optional(TelemetryToken) private telemetry?: any,
          @Optional(CacheToken) private cache?: any
        ) {}

        async sendEmail(to: string, subject: string) {
          // Use logger if available
          this.logger?.log(`Sending email to ${to}`);

          // Use telemetry if available
          this.telemetry?.track('email.sent');

          // Use cache if available
          const cached = this.cache?.get(`template:${subject}`);

          return 'Email sent';
        }
      }

      const metadata: InjectionMetadata[] =
        getMetadata(EmailService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(3);
      expect(metadata.every((m) => m.optional)).toBe(true);
      expect(metadata.find((m) => m.index === 0)?.token).toBe(LoggerToken);
      expect(metadata.find((m) => m.index === 1)?.token).toBe(TelemetryToken);
      expect(metadata.find((m) => m.index === 2)?.token).toBe(CacheToken);
    });

    it('should work for feature flags and conditional dependencies', () => {
      const FeatureFlagsToken = new Token('FeatureFlags');
      const AnalyticsToken = new Token('Analytics');

      class UserDashboard {
        constructor(
          @Optional(FeatureFlagsToken) private featureFlags?: any,
          @Optional(AnalyticsToken) private analytics?: any
        ) {}

        renderDashboard() {
          const showAdvancedFeatures =
            this.featureFlags?.isEnabled('advanced-dashboard') ?? false;

          if (showAdvancedFeatures) {
            this.analytics?.track('advanced.dashboard.viewed');
            return 'Advanced Dashboard';
          }

          return 'Basic Dashboard';
        }
      }

      const metadata: InjectionMetadata[] =
        getMetadata(UserDashboard, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(2);
      expect(metadata.find((m) => m.index === 0)?.token).toBe(
        FeatureFlagsToken
      );
      expect(metadata.find((m) => m.index === 0)?.optional).toBe(true);
      expect(metadata.find((m) => m.index === 1)?.token).toBe(AnalyticsToken);
      expect(metadata.find((m) => m.index === 1)?.optional).toBe(true);
    });
  });
});

// Integration tests with container
describe('@Optional with container integration', () => {
  it('should work when optional dependency is available', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const LoggerToken = new Token<{ log: (msg: string) => void }>('Logger');

    @Service()
    class TestService {
      constructor(
        @Optional(LoggerToken) public logger?: { log: (msg: string) => void }
      ) {}
    }

    const mockLogger = { log: (msg: string) => console.log(msg) };

    const container = new Nexus();
    await container.set({ token: LoggerToken, useValue: mockLogger });
    await container.set(TestService);

    const instance = await container.get(TestService);
    expect(instance.logger).toBe(mockLogger);
  });

  it('should properly record metadata for optional dependencies', async () => {
    // Test that @Optional decorator properly records metadata
    // Note: Full optional dependency resolution in container is not yet implemented
    const LoggerToken = new Token<{ log: (msg: string) => void }>('Logger');

    class TestService {
      constructor(
        @Optional(LoggerToken) public logger?: { log: (msg: string) => void }
      ) {}
    }

    const metadata: InjectionMetadata[] =
      getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toEqual({
      token: LoggerToken,
      propertyKey: undefined,
      index: 0,
      optional: true,
    });
  });

  it('should record metadata for optional property injection', () => {
    const ConfigToken = new Token<{ theme: string }>('Config');

    class AppService {
      @Optional(ConfigToken)
      public config?: { theme: string };
    }

    const metadata: InjectionMetadata[] =
      getMetadata(AppService.prototype, METADATA_KEYS.INJECT_METADATA) || [];

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toEqual({
      token: ConfigToken,
      propertyKey: 'config',
      index: 0,
      optional: true,
    });
  });

  it('should properly record mixed required and optional dependency metadata', () => {
    const DatabaseToken = new Token('Database');
    const LoggerToken = new Token('Logger');

    class UserService {
      constructor(
        @Inject(DatabaseToken) public db: any,
        @Optional(LoggerToken) public logger?: any
      ) {}
    }

    const metadata: InjectionMetadata[] =
      getMetadata(UserService, METADATA_KEYS.INJECT_METADATA) || [];

    expect(metadata).toHaveLength(2);

    // Find required dependency
    const requiredDep = metadata.find((m) => m.index === 0);
    expect(requiredDep?.token).toBe(DatabaseToken);
    expect(requiredDep?.optional).toBeUndefined();

    // Find optional dependency
    const optionalDep = metadata.find((m) => m.index === 1);
    expect(optionalDep?.token).toBe(LoggerToken);
    expect(optionalDep?.optional).toBe(true);
  });

  it('should work when optional dependency is not available', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const LoggerToken = new Token<{ log: (msg: string) => void }>('Logger');

    @Service()
    class TestService {
      constructor(
        @Optional(LoggerToken) public logger?: { log: (msg: string) => void }
      ) {}
    }

    const container = new Nexus();
    // Don't register the logger
    await container.set(TestService);

    const instance = await container.get(TestService);
    expect(instance.logger).toBeUndefined();
  });

  it('should handle optional property injection when dependency is missing', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const ConfigToken = new Token<{ theme: string }>('Config');

    @Service()
    class AppService {
      @Optional(ConfigToken)
      public config?: { theme: string };
    }

    const container = new Nexus();
    // Don't register the config
    await container.set(AppService);

    const instance = await container.get(AppService);
    expect(instance.config).toBeUndefined();
  });

  it('should handle mixed required and optional dependencies in container', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const DatabaseToken = new Token('Database');
    const LoggerToken = new Token('Logger');

    @Service()
    class UserService {
      constructor(
        @Inject(DatabaseToken) public db: any,
        @Optional(LoggerToken) public logger?: any
      ) {}
    }

    const mockDb = { query: () => {} };

    const container = new Nexus();
    await container.set({ token: DatabaseToken, useValue: mockDb });
    // Don't register logger
    await container.set(UserService);

    const instance = await container.get(UserService);
    expect(instance.db).toBe(mockDb);
    expect(instance.logger).toBeUndefined();
  });

  it('should handle multiple optional dependencies with some available', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const LoggerToken = new Token('Logger');
    const CacheToken = new Token('Cache');
    const MetricsToken = new Token('Metrics');

    @Service()
    class ApiService {
      constructor(
        @Optional(LoggerToken) public logger?: any,
        @Optional(CacheToken) public cache?: any,
        @Optional(MetricsToken) public metrics?: any
      ) {}
    }

    const mockLogger = { log: () => {} };
    const mockCache = { get: () => {}, set: () => {} };
    // Don't register metrics

    const container = new Nexus();
    await container.set({ token: LoggerToken, useValue: mockLogger });
    await container.set({ token: CacheToken, useValue: mockCache });
    await container.set(ApiService);

    const instance = await container.get(ApiService);
    expect(instance.logger).toBe(mockLogger);
    expect(instance.cache).toBe(mockCache);
    expect(instance.metrics).toBeUndefined();
  });
});
