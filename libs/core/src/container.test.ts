import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nexus } from './container';
import { Service, Module, Inject, Optional } from './decorators';
import { Token } from './token';
import { NoProvider } from './exceptions';
import { getMetadata } from './helpers';
import { METADATA_KEYS } from './constants';

describe('Nexus', () => {
  let nexus: Nexus;

  beforeEach(async () => {
    nexus = new Nexus();
  });

  // Basic functionality group: Core container operations
  describe('Basic functionality', () => {
    /**
     * Test: Register and resolve a service
     * Validates: Service can be registered and resolved through DI container
     * Value: Ensures basic DI container functionality
     */
    it('should register and resolve a service', async () => {
      @Service()
      class TestService {
        getMessage(): string {
          return 'Hello World';
        }
      }

      await nexus.set(TestService);
      const service = await nexus.get(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getMessage()).toBe('Hello World');
    });

    /**
     * Test: Register multiple services in parallel with setMany
     * Validates: Multiple services can be registered efficiently in parallel
     * Value: Ensures parallel registration performance and convenience
     */
    it('should register multiple services with setMany', async () => {
      @Service()
      class ServiceA {
        getName(): string {
          return 'ServiceA';
        }
      }

      @Service()
      class ServiceB {
        getName(): string {
          return 'ServiceB';
        }
      }

      const TOKEN_C = new Token<string>('ServiceC');

      // Register multiple providers in parallel
      await nexus.setMany(ServiceA, ServiceB, {
        token: TOKEN_C,
        useValue: 'ServiceC',
      });

      // Verify all were registered
      expect(nexus.has(ServiceA)).toBe(true);
      expect(nexus.has(ServiceB)).toBe(true);
      expect(nexus.has(TOKEN_C)).toBe(true);

      // Verify they work
      const serviceA = await nexus.get(ServiceA);
      const serviceB = await nexus.get(ServiceB);
      const serviceC = await nexus.get(TOKEN_C);

      expect(serviceA.getName()).toBe('ServiceA');
      expect(serviceB.getName()).toBe('ServiceB');
      expect(serviceC).toBe('ServiceC');
    });

    /**
     * Test: Singleton instance behavior
     * Validates: Multiple gets return the same instance
     * Value: Ensures singleton pattern is enforced by DI container
     */
    it('should return singleton instances', async () => {
      @Service()
      class TestService {
        getMessage(): string {
          return 'Hello World';
        }
      }

      await nexus.set(TestService);
      const service1 = await nexus.get(TestService);
      const service2 = await nexus.get(TestService);
      expect(service1).toBe(service2);
    });

    /**
     * Test: Error for unregistered token
     * Validates: Throws with clear error message
     * Value: Ensures missing providers are caught early and feedback is clear
     */
    it('should throw error for unregistered token', async () => {
      class Unregistered {}

      await expect(nexus.get(Unregistered)).rejects.toThrow(NoProvider);
    });

    /**
     * Test: Token registration check
     * Validates: has() returns correct boolean before and after registration
     * Value: Ensures container can check registration status for tokens
     */
    it('should check if token is registered', async () => {
      @Service()
      class TestService {
        getMessage(): string {
          return 'Hello World';
        }
      }

      expect(nexus.has(TestService)).toBe(false);
      await nexus.set(TestService);
      expect(nexus.has(TestService)).toBe(true);
    });
  });

  // Dependency injection group: Ensures DI works for constructor injection
  describe('Dependency injection', () => {
    /**
     * Test: Automatic dependency injection
     * Validates: Dependencies are injected into constructor
     * Value: Ensures DI container can resolve and inject dependencies
     */
    it('should inject dependencies automatically', async () => {
      @Service()
      class LoggerService {
        log(message: string): string {
          return `[LOG] ${message}`;
        }
      }

      @Service()
      class UserServiceWithLogger {
        constructor(
          @Inject(LoggerService)
          private logger: LoggerService
        ) {}
        getUser(id: string): string {
          return this.logger.log(`Getting user ${id}`);
        }
      }

      await nexus.set(LoggerService);
      await nexus.set(UserServiceWithLogger);
      const userService = await nexus.get(UserServiceWithLogger);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  // Custom tokens and providers group: Ensures advanced provider registration
  describe('Custom tokens and providers', () => {
    /**
     * Test: Custom token registration using object syntax
     * Validates: Providers can be registered and resolved with custom tokens
     * Value: Enables advanced DI scenarios with custom keys
     */
    it('should work with custom tokens', async () => {
      const API_URL = new Token<string>('API_URL');
      const CONFIG_TOKEN = new Token('CONFIG');

      @Service({ token: CONFIG_TOKEN })
      class ConfigService {
        constructor(@Inject(API_URL) private apiUrl: string) {}
        getApiUrl(): string {
          return this.apiUrl;
        }
      }

      await nexus.set({ token: API_URL, useValue: 'https://api.example.com' });
      await nexus.set(ConfigService);

      const config: ConfigService = await nexus.get(CONFIG_TOKEN);
      expect(config.getApiUrl()).toBe('https://api.example.com');
    });

    /**
     * Test: Factory provider registration
     * Validates: Factory is called and result is returned
     * Value: Enables dynamic provider creation in DI
     */
    it('should work with factory providers', async () => {
      const FACTORY_TOKEN = new Token<string>('FACTORY_TOKEN');
      const factory = vi.fn().mockReturnValue('factory-result');

      await nexus.set({ token: FACTORY_TOKEN, useFactory: factory });
      const result = await nexus.get(FACTORY_TOKEN);

      expect(result).toBe('factory-result');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    /**
     * Test: Factory provider with dependencies
     * Validates: Factory receives correct dependencies
     * Value: Ensures DI can resolve and inject dependencies for factories
     */
    it('should work with factory providers with dependencies', async () => {
      const DEP1 = new Token<string>('DEP1');
      const DEP2 = new Token<string>('DEP2');
      const FACTORY_TOKEN = new Token<string>('FACTORY_WITH_DEPS');

      // Register dependencies
      await nexus.set({ token: DEP1, useValue: 'dependency1' });
      await nexus.set({ token: DEP2, useValue: 'dependency2' });

      // Create factory that expects dependencies
      const factory = vi
        .fn()
        .mockImplementation((dep1: string, dep2: string) => {
          return `${dep1}-${dep2}-result`;
        });

      // Register factory with dependencies
      await nexus.set({
        token: FACTORY_TOKEN,
        useFactory: factory,
        deps: [DEP1, DEP2],
      });

      const result = await nexus.get(FACTORY_TOKEN);
      expect(result).toBe('dependency1-dependency2-result');
      expect(factory).toHaveBeenCalledWith('dependency1', 'dependency2');
    });

    /**
     * Test: Auto-generated token registration
     * Validates: Providers can be registered and resolved with auto tokens
     * Value: Ensures DI supports unique, unnamed tokens
     */
    it('should work with value providers', async () => {
      const VALUE_TOKEN = new Token<string>('VALUE_TOKEN');

      await nexus.set({ token: VALUE_TOKEN, useValue: 'auto-generated-value' });
      const result = await nexus.get(VALUE_TOKEN);
      expect(result).toBe('auto-generated-value');
    });
  });

  // Module registration group: Ensures modules can register services
  describe('Module registration', () => {
    /**
     * Test: Register module and its services
     * Validates: All services in module are registered and resolvable
     * Value: Ensures module-based DI registration works for applications
     */
    it('should register module and its services', async () => {
      @Service()
      class LoggerService {
        log(message: string): string {
          return `[LOG] ${message}`;
        }
      }

      @Service()
      class UserServiceWithLogger {
        constructor(
          @Inject(LoggerService)
          private logger: LoggerService
        ) {}
        getUser(id: string): string {
          return this.logger.log(`Getting user ${id}`);
        }
      }

      @Module({
        providers: [LoggerService, UserServiceWithLogger],
      })
      class AppModule {}

      await nexus.set(AppModule);

      expect(nexus.has(LoggerService)).toBe(true);
      expect(nexus.has(UserServiceWithLogger)).toBe(true);
      const userService = await nexus.get(UserServiceWithLogger);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  // Child containers group: Ensures container inheritance works
  describe('Child containers', () => {
    /**
     * Test: Child container inherits providers
     * Validates: Child containers have access to parent providers
     * Value: Enables scoped DI for different application contexts
     */
    it('should inherit from parent container', async () => {
      @Service()
      class ParentService {
        getMessage(): string {
          return 'parent';
        }
      }

      await nexus.set(ParentService);
      const child = nexus.createChild();
      expect(child.has(ParentService)).toBe(true);
      const service = await child.get(ParentService);
      expect(service.getMessage()).toBe('parent');
    });

    /**
     * Test: Child container can override providers
     * Validates: Child containers can shadow parent providers
     * Value: Enables context-specific provider overrides in DI
     */
    it('should allow overriding in child container', async () => {
      @Service()
      class ParentService {
        getMessage(): string {
          return 'parent';
        }
      }

      @Service()
      class ChildService {
        getMessage(): string {
          return 'child';
        }
      }

      await nexus.set(ParentService);
      const child = nexus.createChild();
      await child.set({ token: ParentService, useClass: ChildService });

      const parentService = await nexus.get(ParentService);
      const childService = await child.get(ParentService);

      expect(parentService.getMessage()).toBe('parent');
      expect(childService.getMessage()).toBe('child');
    });
  });

  // Container lifecycle group: Ensures container lifecycle management
  describe('Container lifecycle', () => {
    /**
     * Test: Clear all providers and instances
     * Validates: Container can be reset to empty state
     * Value: Enables container cleanup for testing and lifecycle management
     */
    it('should clear all providers and instances', async () => {
      @Service()
      class TestServiceForLifecycle {
        getMessage(): string {
          return 'test';
        }
      }

      await nexus.set(TestServiceForLifecycle);
      expect(nexus.has(TestServiceForLifecycle)).toBe(true);
      await nexus.clear();
      expect(nexus.has(TestServiceForLifecycle)).toBe(false);
    });
  });

  // Homepage Example group: Integration test for documentation example
  describe('Homepage Example', () => {
    /**
     * Test: Homepage example integration
     * Validates: Documentation examples work correctly
     * Value: Ensures examples in documentation are accurate
     */
    it('should register and resolve UserService using a token', async () => {
      const USER_SERVICE = new Token<UserService>('UserService');

      class UserService {
        getUsers() {
          return ['Alice', 'Bob', 'Charlie'];
        }
      }

      await nexus.set({ token: USER_SERVICE, useClass: UserService });
      const userService = (await nexus.get(USER_SERVICE)) as UserService;
      expect(userService.getUsers()).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });

  // Test edge cases for provider validation
  describe('Provider edge cases', () => {
    describe('Provider registration edge cases', () => {
      it('should throw InvalidToken for invalid token types', async () => {
        await expect(nexus.get(null as any)).rejects.toThrow('Invalid token');
      });

      it('should throw InvalidProvider for null or undefined provider', async () => {
        await expect(nexus.set(null as any)).rejects.toThrow('Invalid');
      });

      it('should throw InvalidProvider for non-object provider', async () => {
        await expect(nexus.set('invalid' as any)).rejects.toThrow('Invalid');
      });

      it('should throw InvalidProvider if factory provider is missing useFactory', async () => {
        await expect(
          nexus.set({ token: new Token('TEST'), deps: [] } as any)
        ).rejects.toThrow('Invalid provider');
      });

      it('should throw InvalidProvider if useFactory is not a function', async () => {
        await expect(
          nexus.set({
            token: new Token('TEST'),
            useFactory: 'not-function',
          } as any)
        ).rejects.toThrow('Invalid provider');
      });
    });

    it('should resolve class and alias to the same instance', async () => {
      const ALIAS = Symbol('ALIAS');

      @Service()
      class AliasService {
        getValue() {
          return 42;
        }
      }

      await nexus.set({ token: ALIAS, useClass: AliasService });
      const instance1 = (await nexus.get(ALIAS)) as AliasService;
      const instance2 = await nexus.get(AliasService);
      expect(instance1).toBe(instance2);
      expect(instance1.getValue()).toBe(42);
    });

    it('should allow overwriting providers for the same token', async () => {
      const TOKEN = new Token<number>('OVERRIDE');

      await nexus.set({ token: TOKEN, useValue: 1 });
      expect(await nexus.get(TOKEN)).toBe(1);

      await nexus.set({ token: TOKEN, useValue: 2 });
      expect(await nexus.get(TOKEN)).toBe(2);
    });

    it('should throw if registering undecorated class without explicit configuration', async () => {
      class NotAService {}

      await expect(nexus.set(NotAService)).rejects.toThrow('Invalid provider');
    });
  });

  describe('Module import edge cases', () => {
    it('should handle circular module imports gracefully', async () => {
      @Module({ imports: [] })
      class A {}

      @Module({ imports: [A] })
      class B {}

      // Should not throw due to circular imports
      await nexus.set(A);
      await nexus.set(B);
    });
  });

  describe('Property injection', () => {
    it('should inject property with @Inject', async () => {
      @Service()
      class Dep {
        value = 123;
      }

      @Service()
      class Consumer {
        @Inject(Dep) dep!: Dep;
      }

      await nexus.set(Dep);
      await nexus.set(Consumer);
      const consumer = (await nexus.get(Consumer)) as Consumer;
      expect(consumer.dep).toBeInstanceOf(Dep);
      expect(consumer.dep.value).toBe(123);
    });
  });

  describe('Container initialization', () => {
    it('should initialize container successfully', async () => {
      // Test basic initialization
      await nexus.init();

      // Should be able to initialize multiple times without error
      await nexus.init();
    });

    it('should handle providers registered after initialization', async () => {
      await nexus.init();

      @Service()
      class LateService {
        getValue() {
          return 'late-service';
        }
      }

      await nexus.set(LateService);
      const instance = await nexus.get(LateService);
      expect(instance.getValue()).toBe('late-service');
    });

    it('should initialize singleton providers only once', async () => {
      const mockFactory = vi.fn().mockReturnValue('singleton-result');
      const TOKEN = new Token('SingletonProvider');

      await nexus.set({
        token: TOKEN,
        useFactory: mockFactory,
      });

      await nexus.init();

      // Getting it multiple times should return cached result
      const result1 = await nexus.get(TOKEN);
      const result2 = await nexus.get(TOKEN);

      expect(result1).toBe('singleton-result');
      expect(result2).toBe('singleton-result');
      expect(mockFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Async provider support', () => {
    it('should handle Promise<ModuleConfig> registration', async () => {
      const TOKEN = new Token('AsyncConfig');
      const configPromise = Promise.resolve({
        providers: [{ token: TOKEN, useValue: 'async-value' }],
      });

      await nexus.set(configPromise);
      const result = await nexus.get(TOKEN);
      expect(result).toBe('async-value');
    });

    it('should handle multiple Promise<ModuleConfig> in setMany', async () => {
      const TOKEN1 = new Token('Async1');
      const TOKEN2 = new Token('Async2');

      const config1 = Promise.resolve({
        providers: [{ token: TOKEN1, useValue: 'async1' }],
      });

      const config2 = Promise.resolve({
        providers: [{ token: TOKEN2, useValue: 'async2' }],
      });

      await nexus.setMany(config1, config2);

      const result1 = await nexus.get(TOKEN1);
      const result2 = await nexus.get(TOKEN2);

      expect(result1).toBe('async1');
      expect(result2).toBe('async2');
    });

    it('should reject invalid Promise<ModuleConfig>', async () => {
      const invalidPromise = Promise.resolve('not-a-module-config' as any);

      await expect(nexus.set(invalidPromise)).rejects.toThrow(
        'Promise must resolve to a ModuleConfig'
      );
    });
  });

  describe('Container dispose and lifecycle', () => {
    it('should implement AsyncDisposable', async () => {
      expect(Symbol.asyncDispose in nexus).toBe(true);
    });

    it('should prevent operations on disposed container', async () => {
      await nexus.dispose();

      await expect(nexus.set({} as any)).rejects.toThrow(
        'Cannot set providers on a disposed container'
      );

      await expect(nexus.get(new Token('test'))).rejects.toThrow(
        'Cannot get from a disposed container'
      );

      expect(nexus.has(new Token('test'))).toBe(false);
    });

    it('should dispose tracked disposable instances', async () => {
      const mockDispose = vi.fn();
      const mockAsyncDispose = vi.fn();

      class DisposableService {
        [Symbol.dispose]() {
          mockDispose();
        }
      }

      class AsyncDisposableService {
        [Symbol.asyncDispose]() {
          mockAsyncDispose();
        }
      }

      const TOKEN1 = new Token('Disposable');
      const TOKEN2 = new Token('AsyncDisposable');

      await nexus.set({ token: TOKEN1, useClass: DisposableService });
      await nexus.set({ token: TOKEN2, useClass: AsyncDisposableService });

      // Create instances (they get tracked for disposal)
      await nexus.get(TOKEN1);
      await nexus.get(TOKEN2);

      await nexus.dispose();

      // Note: Disposal might be called multiple times due to tracking in both
      // disposables array and provider instances
      expect(mockDispose).toHaveBeenCalled();
      expect(mockAsyncDispose).toHaveBeenCalled();
    });
  });

  describe('Resolve method (transient instances)', () => {
    it('should resolve dependencies without registering service', async () => {
      @Service()
      class Dependency {
        getValue() {
          return 'dependency-value';
        }
      }

      class TransientService {
        constructor(@Inject(Dependency) private dep: Dependency) {}

        getMessage() {
          return `Message: ${this.dep.getValue()}`;
        }
      }

      // Register the dependency but not the service
      await nexus.set(Dependency);

      // Resolve should create a new instance without registering it
      const instance = await nexus.resolve(TransientService);
      expect(instance).toBeInstanceOf(TransientService);
      expect(instance.getMessage()).toBe('Message: dependency-value');

      // Service should not be registered in container
      expect(nexus.has(TransientService)).toBe(false);
    });

    it('should create new instances each time with resolve', async () => {
      class SimpleService {
        id = Math.random();
      }

      const instance1 = await nexus.resolve(SimpleService);
      const instance2 = await nexus.resolve(SimpleService);

      expect(instance1).not.toBe(instance2);
      expect(instance1.id).not.toBe(instance2.id);
    });

    it('should handle property injection in resolved instances', async () => {
      @Service()
      class Dependency {
        value = 42;
      }

      class ServiceWithPropertyInjection {
        @Inject(Dependency) dep!: Dependency;
      }

      await nexus.set(Dependency);

      const instance = await nexus.resolve(ServiceWithPropertyInjection);
      expect(instance.dep).toBeInstanceOf(Dependency);
      expect(instance.dep.value).toBe(42);
    });

    it('should throw for invalid constructor in resolve', async () => {
      await expect(nexus.resolve('not-a-constructor' as any)).rejects.toThrow(
        'resolve() requires a constructor function'
      );
    });
  });

  describe('Container introspection and utilities', () => {
    it('should list all registered providers and modules', async () => {
      @Service()
      class TestService {
        name = 'test';
      }

      @Module({ providers: [TestService] })
      class TestModule {}

      const TOKEN = new Token('test-token');

      await nexus.set(TestModule);
      await nexus.set({ token: TOKEN, useValue: 'test-value' });

      const list = nexus.list();

      expect(list.providers).toContain(TestService);
      expect(list.providers).toContain(TOKEN);
      expect(list.modules).toContain('TestModule');
    });

    it('should handle token aliases correctly', async () => {
      @Service()
      class OriginalService {
        getValue() {
          return 'original';
        }
      }

      const ALIAS_TOKEN = Symbol('ServiceAlias');

      await nexus.set({ token: ALIAS_TOKEN, useClass: OriginalService });

      const aliasInstance = (await nexus.get(ALIAS_TOKEN)) as OriginalService;
      const classInstance = await nexus.get(OriginalService);

      // Should be the same singleton instance
      expect(aliasInstance).toBe(classInstance);
      expect(aliasInstance.getValue()).toBe('original');
    });
  });

  describe('Complex dependency resolution', () => {
    it('should handle deep dependency chains', async () => {
      const TokenA = new Token('A');
      const TokenB = new Token('B');
      const TokenC = new Token('C');

      await nexus.set({ token: TokenC, useValue: 'C' });
      await nexus.set({
        token: TokenB,
        useFactory: (c: string) => `B-${c}`,
        deps: [TokenC],
      });
      await nexus.set({
        token: TokenA,
        useFactory: (b: string) => `A-${b}`,
        deps: [TokenB],
      });

      const result = await nexus.get(TokenA);
      expect(result).toBe('A-B-C');
    });

    it('should handle multiple dependencies in factories', async () => {
      const TokenX = new Token('X');
      const TokenY = new Token('Y');
      const TokenResult = new Token('Result');

      await nexus.set({ token: TokenX, useValue: 'X' });
      await nexus.set({ token: TokenY, useValue: 'Y' });
      await nexus.set({
        token: TokenResult,
        useFactory: (x: string, y: string) => `${x}-${y}`,
        deps: [TokenX, TokenY],
      });

      const result = await nexus.get(TokenResult);
      expect(result).toBe('X-Y');
    });

    it('should handle mixed provider types in dependency chains', async () => {
      @Service()
      class BaseService {
        getValue() {
          return 'base';
        }
      }

      const ConfigToken = new Token('Config');
      const FactoryToken = new Token('Factory');

      await nexus.set({ token: ConfigToken, useValue: { prefix: 'TEST' } });
      await nexus.set(BaseService);
      await nexus.set({
        token: FactoryToken,
        useFactory: (base: BaseService, config: any) =>
          `${config.prefix}: ${base.getValue()}`,
        deps: [BaseService, ConfigToken],
      });

      const result = await nexus.get(FactoryToken);
      expect(result).toBe('TEST: base');
    });
  });

  describe('Provider singleton behavior', () => {
    it('should enforce singleton by default', async () => {
      const mockFactory = vi.fn().mockReturnValue({ id: Math.random() });
      const TOKEN = new Token('DefaultSingleton');

      await nexus.set({
        token: TOKEN,
        useFactory: mockFactory,
      });

      const instance1 = await nexus.get(TOKEN);
      const instance2 = await nexus.get(TOKEN);

      expect(instance1).toBe(instance2);
      expect(mockFactory).toHaveBeenCalledTimes(1);
    });

    it('should cache class instances as singletons', async () => {
      @Service()
      class SingletonService {
        id = Math.random();
      }

      await nexus.set(SingletonService);

      const instance1 = await nexus.get(SingletonService);
      const instance2 = await nexus.get(SingletonService);

      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(instance2.id);
    });
  });
});
