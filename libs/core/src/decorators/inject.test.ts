import { describe, it, expect, beforeEach } from 'vitest';
import { Inject } from './inject';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';
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

  describe('Advanced injection scenarios', () => {
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

describe('@Inject with container integration', () => {
  it('should properly inject dependencies through container', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./service');

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

  it('should throw when required dependency is missing', async () => {
    const { Nexus } = await import('../container');
    const { Service } = await import('./service');
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
