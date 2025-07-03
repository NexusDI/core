import { describe, it, expect, beforeEach } from 'vitest';
import { Inject, InjectParam } from './inject';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';
import { Service } from './provider';
import { Nexus } from '../container';
import { NoProvider } from '../exceptions';
import type { InjectionMetadata } from '../types';

describe('@Inject decorator', () => {
  let TestToken: Token<string>;
  let ConfigToken: Token<{ apiUrl: string }>;

  beforeEach(() => {
    TestToken = new Token<string>('TestService');
    ConfigToken = new Token<{ apiUrl: string }>('Config');
  });

  describe('Constructor parameter injection (primary usage)', () => {
    it('should inject a service token into constructor parameter', () => {
      class UserService {
        constructor(@Inject(TestToken) private service: string) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(UserService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: TestToken,
        propertyKey: undefined,
        index: 0,
      });
    });

    it('should inject configuration token into service constructor', () => {
      class DatabaseService {
        constructor(@Inject(ConfigToken) private config: { apiUrl: string }) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(DatabaseService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: ConfigToken,
        propertyKey: undefined,
        index: 0,
      });
    });

    it('should handle multiple injected parameters in realistic service', () => {
      const LoggerToken = new Token<{ log: (msg: string) => void }>('Logger');
      const HttpToken = new Token<{ get: (url: string) => Promise<any> }>(
        'Http'
      );

      class ApiService {
        constructor(
          @Inject(ConfigToken) private config: { apiUrl: string },
          @Inject(LoggerToken) private logger: { log: (msg: string) => void },
          @Inject(HttpToken)
          private http: { get: (url: string) => Promise<any> }
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(ApiService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(3);
      // Metadata is stored in order of decorator application
      expect(metadata.find((m) => m.index === 0)?.token).toBe(ConfigToken);
      expect(metadata.find((m) => m.index === 1)?.token).toBe(LoggerToken);
      expect(metadata.find((m) => m.index === 2)?.token).toBe(HttpToken);
    });

    it('should work with class constructor tokens (common pattern)', () => {
      class DatabaseConnection {}

      class UserRepository {
        constructor(
          @Inject(DatabaseConnection) private db: DatabaseConnection
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(UserRepository, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: DatabaseConnection,
        propertyKey: undefined,
        index: 0,
      });
    });
  });

  describe('Property injection (legacy decorator syntax)', () => {
    it('should inject into a class property using legacy syntax', () => {
      class UserService {
        @Inject(TestToken)
        private service!: string;
      }

      const metadata: InjectionMetadata[] =
        getMetadata(UserService.prototype, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: TestToken,
        propertyKey: 'service',
        index: -1,
      });
    });

    it('should inject configuration into service property', () => {
      class EmailService {
        @Inject(ConfigToken)
        private config!: { apiUrl: string };
      }

      const metadata: InjectionMetadata[] =
        getMetadata(EmailService.prototype, METADATA_KEYS.INJECT_METADATA) ||
        [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: ConfigToken,
        propertyKey: 'config',
        index: -1,
      });
    });

    it('should handle symbol property keys', () => {
      const serviceSymbol = Symbol('service');

      class TestClass {
        @Inject(TestToken)
        [serviceSymbol]!: string;
      }

      const metadata: InjectionMetadata[] =
        getMetadata(TestClass.prototype, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: TestToken,
        propertyKey: serviceSymbol,
        index: -1,
      });
    });
  });

  describe('Advanced injection scenarios', () => {
    it('should handle InjectParam decorator with property key', () => {
      class TestService {
        testMethod(@InjectParam(TestToken) param: any) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        token: TestToken,
        propertyKey: 'testMethod',
        index: 0,
      });
    });

    it('should handle injection with different token types', () => {
      const SymbolToken = Symbol('SymbolService');
      const StringToken = new Token('StringService');
      class ClassToken {}

      class TestService {
        constructor(
          @Inject(SymbolToken) symbolService: any,
          @Inject(StringToken) stringService: any,
          @Inject(ClassToken) classService: any
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(3);
      expect(metadata.find((m) => m.index === 0)?.token).toBe(SymbolToken);
      expect(metadata.find((m) => m.index === 1)?.token).toBe(StringToken);
      expect(metadata.find((m) => m.index === 2)?.token).toBe(ClassToken);
    });

    it('should preserve metadata order for multiple decorators', () => {
      const FirstToken = new Token('First');
      const SecondToken = new Token('Second');
      const ThirdToken = new Token('Third');

      class TestService {
        constructor(
          @Inject(FirstToken) first: any,
          @Inject(SecondToken) second: any,
          @Inject(ThirdToken) third: any
        ) {}
      }

      const metadata: InjectionMetadata[] =
        getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(metadata).toHaveLength(3);
      // Verify metadata is stored correctly by index
      expect(metadata.find((m) => m.index === 0)?.token).toBe(FirstToken);
      expect(metadata.find((m) => m.index === 1)?.token).toBe(SecondToken);
      expect(metadata.find((m) => m.index === 2)?.token).toBe(ThirdToken);
    });

    it('should handle parameter injection in constructors vs methods differently', () => {
      class TestService {
        constructor(@Inject(TestToken) ctorParam: any) {}

        methodWithParam(@InjectParam(ConfigToken) methodParam: any) {}
      }

      const ctorMetadata: InjectionMetadata[] =
        getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

      expect(ctorMetadata).toHaveLength(2); // Constructor + method param

      // Constructor parameter should have propertyKey undefined
      const ctorParam = ctorMetadata.find((m) => m.propertyKey === undefined);
      expect(ctorParam?.token).toBe(TestToken);
      expect(ctorParam?.index).toBe(0);

      // Method parameter should have propertyKey set
      const methodParam = ctorMetadata.find(
        (m) => m.propertyKey === 'methodWithParam'
      );
      expect(methodParam?.token).toBe(ConfigToken);
      expect(methodParam?.index).toBe(0);
    });
  });

  describe('Mixed decorator usage patterns', () => {
    it('should handle combination of constructor and property injection', () => {
      const DatabaseToken = new Token('Database');
      const CacheToken = new Token('Cache');

      class UserService {
        constructor(@Inject(DatabaseToken) private db: any) {}

        @Inject(CacheToken)
        private cache!: any;
      }

      // Check constructor metadata
      const ctorMetadata: InjectionMetadata[] =
        getMetadata(UserService, METADATA_KEYS.INJECT_METADATA) || [];
      expect(ctorMetadata).toHaveLength(1);
      expect(ctorMetadata[0].token).toBe(DatabaseToken);
      expect(ctorMetadata[0].index).toBe(0);

      // Check property metadata
      const propMetadata: InjectionMetadata[] =
        getMetadata(UserService.prototype, METADATA_KEYS.INJECT_METADATA) || [];
      expect(propMetadata).toHaveLength(1);
      expect(propMetadata[0].token).toBe(CacheToken);
      expect(propMetadata[0].propertyKey).toBe('cache');
    });

    it('should handle multiple property injections on same class', () => {
      const LoggerToken = new Token('Logger');
      const MetricsToken = new Token('Metrics');
      const ConfigToken = new Token('Config');

      class MultiService {
        @Inject(LoggerToken)
        private logger!: any;

        @Inject(MetricsToken)
        private metrics!: any;

        @Inject(ConfigToken)
        public config!: any;
      }

      const metadata: InjectionMetadata[] =
        getMetadata(MultiService.prototype, METADATA_KEYS.INJECT_METADATA) ||
        [];

      expect(metadata).toHaveLength(3);
      expect(metadata.find((m) => m.propertyKey === 'logger')?.token).toBe(
        LoggerToken
      );
      expect(metadata.find((m) => m.propertyKey === 'metrics')?.token).toBe(
        MetricsToken
      );
      expect(metadata.find((m) => m.propertyKey === 'config')?.token).toBe(
        ConfigToken
      );
    });
  });

  describe('Error handling for unsupported usage', () => {
    it('should record metadata correctly for supported patterns', () => {
      // Test that valid injection patterns work correctly
      class ValidService {
        constructor(@Inject(TestToken) private dep: string) {}
      }

      const metadata =
        getMetadata(ValidService, METADATA_KEYS.INJECT_METADATA) || [];
      expect(metadata).toHaveLength(1);
      expect(metadata[0].token).toBe(TestToken);
    });
  });
});

describe('@InjectParam decorator', () => {
  let ServiceToken: Token<any>;

  beforeEach(() => {
    ServiceToken = new Token('Service');
  });

  it('should inject constructor parameter with explicit parameter decorator', () => {
    class TestService {
      constructor(@InjectParam(ServiceToken) service: any) {}
    }

    const metadata: InjectionMetadata[] =
      getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toEqual({
      token: ServiceToken,
      propertyKey: undefined,
      index: 0,
    });
  });

  it('should handle multiple parameters with InjectParam', () => {
    const ConfigToken = new Token('Config');
    const LoggerToken = new Token('Logger');

    class TestService {
      constructor(
        @InjectParam(ServiceToken) service: any,
        @InjectParam(ConfigToken) config: any,
        @InjectParam(LoggerToken) logger: any
      ) {}
    }

    const metadata: InjectionMetadata[] =
      getMetadata(TestService, METADATA_KEYS.INJECT_METADATA) || [];

    expect(metadata).toHaveLength(3);
    // Check by index rather than array position since order may vary
    expect(metadata.find((m) => m.index === 0)?.token).toBe(ServiceToken);
    expect(metadata.find((m) => m.index === 1)?.token).toBe(ConfigToken);
    expect(metadata.find((m) => m.index === 2)?.token).toBe(LoggerToken);
  });
});

describe('@Inject with container integration', () => {
  it('should properly inject dependencies through container', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const TestToken = new Token<string>('TestValue');

    @Service()
    class TestService {
      constructor(@Inject(TestToken) public value: string) {}
    }

    const container = new Nexus();
    await container.set({ token: TestToken, useValue: 'injected value' });
    await container.set(TestService);

    const instance = await container.get(TestService);
    expect(instance.value).toBe('injected value');
  });

  it('should handle property injection through container', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');

    const ConfigToken = new Token<{ apiUrl: string }>('Config');

    @Service()
    class ApiService {
      @Inject(ConfigToken)
      public config!: { apiUrl: string };
    }

    const container = new Nexus();
    await container.set({
      token: ConfigToken,
      useValue: { apiUrl: 'https://api.example.com' },
    });
    await container.set(ApiService);

    const instance = await container.get(ApiService);
    expect(instance.config.apiUrl).toBe('https://api.example.com');
  });

  it('should throw when required dependency is missing', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./provider');
    const { NoProvider } = await import('../exceptions');

    const MissingToken = new Token<string>('Missing');

    @Service()
    class TestService {
      constructor(@Inject(MissingToken) public value: string) {}
    }

    const container = new Nexus();
    await container.set(TestService);

    await expect(container.get(TestService)).rejects.toThrow(NoProvider);
  });
});
