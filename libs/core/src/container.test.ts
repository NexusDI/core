import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Nexus } from './container';
import { Inject, Service, Module, Provider } from './decorators';
import { Token } from './token';
import {
  InvalidToken,
  InvalidService,
  NoProvider,
  InvalidProvider,
} from './exceptions';

describe('Nexus', () => {
  let nexus: Nexus;

  beforeEach(() => {
    nexus = new Nexus();
  });

  // Basic functionality group: Ensures core service registration and resolution
  describe('Basic functionality', () => {
    /**
     * Test: Register and resolve a service
     * Validates: Service can be registered and resolved, and method works
     * Value: Ensures DI container can instantiate and return services
     */
    it('should register and resolve a service', () => {
      @Service()
      class TestService {
        getMessage(): string {
          return 'Hello World';
        }
      }
      nexus.set(TestService, {
        useClass: TestService,
      });
      const service = nexus.get(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getMessage()).toBe('Hello World');
    });
    /**
     * Test: Singleton instance behavior
     * Validates: Multiple gets return the same instance
     * Value: Ensures singleton pattern is enforced by DI container
     */
    it('should return singleton instances', () => {
      @Service()
      class TestService {
        getMessage(): string {
          return 'Hello World';
        }
      }
      nexus.set(TestService, {
        useClass: TestService,
      });
      const service1 = nexus.get(TestService);
      const service2 = nexus.get(TestService);
      expect(service1).toBe(service2);
    });
    /**
     * Test: Error for unregistered token
     * Validates: Throws with clear error message
     * Value: Ensures missing providers are caught early and feedback is clear
     */
    it('should throw error for unregistered token', () => {
      class Unregistered {}
      expect(() => nexus.get(Unregistered)).toThrowError(NoProvider);
    });
    /**
     * Test: Token registration check
     * Validates: has() returns correct boolean before and after registration
     * Value: Ensures container can check registration status for tokens
     */
    it('should check if token is registered', () => {
      @Service()
      class TestService {
        getMessage(): string {
          return 'Hello World';
        }
      }
      expect(nexus.has(TestService)).toBe(false);
      nexus.set(TestService, {
        useClass: TestService,
      });
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
    it('should inject dependencies automatically', () => {
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
      nexus.set(LoggerService, {
        useClass: LoggerService,
      });
      nexus.set(UserServiceWithLogger, {
        useClass: UserServiceWithLogger,
      });
      const userService = nexus.get(UserServiceWithLogger);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  // Custom tokens and providers group: Ensures advanced provider registration
  describe('Custom tokens and providers', () => {
    /**
     * Test: Custom token registration
     * Validates: Providers can be registered and resolved with custom tokens
     * Value: Enables advanced DI scenarios with custom keys
     */
    it('should work with custom tokens', () => {
      const API_URL = new Token<string>('API_URL');
      const CONFIG_TOKEN = new Token('CONFIG');
      @Provider(CONFIG_TOKEN)
      class ConfigService {
        constructor(@Inject(API_URL) private apiUrl: string) {}
        getApiUrl(): string {
          return this.apiUrl;
        }
      }
      nexus.set(API_URL, {
        useValue: 'https://api.example.com',
      });
      nexus.set(CONFIG_TOKEN, {
        useClass: ConfigService,
      });
      const config = nexus.get(CONFIG_TOKEN) as ConfigService;
      expect(config.getApiUrl()).toBe('https://api.example.com');
    });
    /**
     * Test: Factory provider registration
     * Validates: Factory is called and result is returned
     * Value: Enables dynamic provider creation in DI
     */
    it('should work with factory providers', () => {
      const FACTORY_TOKEN = new Token<string>('FACTORY_TOKEN');
      const factory = vi.fn().mockReturnValue('factory-result');
      nexus.set(FACTORY_TOKEN, {
        useFactory: factory,
      });
      const result = nexus.get(FACTORY_TOKEN);
      expect(result).toBe('factory-result');
      expect(factory).toHaveBeenCalledTimes(1);
    });
    /**
     * Test: Factory provider with dependencies
     * Validates: Factory receives correct dependencies
     * Value: Ensures DI can resolve and inject dependencies for factories
     */
    it('should work with factory providers with dependencies', () => {
      const DEP1 = new Token<string>('DEP1');
      const DEP2 = new Token<string>('DEP2');
      const FACTORY_TOKEN = new Token<string>('FACTORY_WITH_DEPS');

      // Register dependencies
      nexus.set(DEP1, { useValue: 'dependency1' });
      nexus.set(DEP2, { useValue: 'dependency2' });

      // Create factory that expects dependencies
      const factory = vi
        .fn()
        .mockImplementation((dep1: string, dep2: string) => {
          return `${dep1}-${dep2}-result`;
        });

      // Register factory with dependencies
      nexus.set(FACTORY_TOKEN, {
        useFactory: factory,
        deps: [DEP1, DEP2],
      });

      const result = nexus.get(FACTORY_TOKEN);
      expect(result).toBe('dependency1-dependency2-result');
      expect(factory).toHaveBeenCalledWith('dependency1', 'dependency2');
    });
    /**
     * Test: Auto-generated token registration
     * Validates: Providers can be registered and resolved with auto tokens
     * Value: Ensures DI supports unique, unnamed tokens
     */
    it('should work with auto-generated tokens', () => {
      const autoToken = new Token();
      nexus.set(autoToken, {
        useValue: 'auto-generated-value',
      });
      const result = nexus.get(autoToken);
      expect(result).toBe('auto-generated-value');
    });

    it('should throw InvalidToken for invalid token types', () => {
      // @ts-expect-error
      expect(() => nexus.get('INVALID')).toThrowError(InvalidToken);
      // @ts-expect-error
      expect(() => nexus.set('INVALID', { useValue: 123 })).toThrowError(
        InvalidToken
      );
    });
  });

  // Module registration group: Ensures modules can register services
  describe('Module registration', () => {
    /**
     * Test: Register module and its services
     * Validates: All services in module are registered and resolvable
     * Value: Ensures module-based DI registration works for applications
     */
    it('should register module and its services', () => {
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
        services: [LoggerService, UserServiceWithLogger],
      })
      class AppModule {}
      nexus.set(AppModule);
      expect(nexus.has(LoggerService)).toBe(true);
      expect(nexus.has(UserServiceWithLogger)).toBe(true);
      const userService = nexus.get(UserServiceWithLogger);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  // Child containers group: Ensures child containers inherit and override providers
  describe('Child containers', () => {
    /**
     * Test: Inherit from parent container
     * Validates: Child container can resolve parent providers
     * Value: Enables hierarchical DI for modular applications
     */
    it('should inherit from parent container', () => {
      @Service()
      class ParentService {
        getMessage(): string {
          return 'parent';
        }
      }
      nexus.set(ParentService, {
        useClass: ParentService,
      });
      const child = nexus.createChildContainer();
      expect(child.has(ParentService)).toBe(true);
      const service = child.get(ParentService);
      expect(service.getMessage()).toBe('parent');
    });
    /**
     * Test: Override provider in child container
     * Validates: Child can override parent provider
     * Value: Ensures flexibility for testing and modular overrides
     */
    it('should allow overriding in child container', () => {
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
      nexus.set(ParentService, {
        useClass: ParentService,
      });
      const child = nexus.createChildContainer();
      child.set(ParentService, {
        useClass: ChildService,
      });
      const parentService = nexus.get(ParentService);
      const childService = child.get(ParentService);
      expect(parentService.getMessage()).toBe('parent');
      expect(childService.getMessage()).toBe('child');
    });
  });

  // Container lifecycle group: Ensures providers and instances can be cleared
  describe('Container lifecycle', () => {
    /**
     * Test: Clear all providers and instances
     * Validates: Providers are removed and cannot be resolved
     * Value: Ensures container can be reset for testing or hot reload
     */
    it('should clear all providers and instances', () => {
      @Service()
      class TestServiceForLifecycle {
        getMessage(): string {
          return 'test';
        }
      }
      nexus.set(TestServiceForLifecycle, {
        useClass: TestServiceForLifecycle,
      });
      expect(nexus.has(TestServiceForLifecycle)).toBe(true);
      nexus.clear();
      expect(nexus.has(TestServiceForLifecycle)).toBe(false);
    });
  });

  // Homepage Example group: Ensures real-world usage is covered
  describe('Homepage Example', () => {
    /**
     * Test: Register and resolve UserService using a token
     * Validates: Service can be registered and resolved by token
     * Value: Demonstrates real-world usage and regression coverage
     */
    it('should register and resolve UserService using a token', () => {
      const USER_SERVICE = new Token('UserService');
      @Service()
      class UserService {
        getUsers() {
          return ['Alice', 'Bob', 'Charlie'];
        }
      }
      const container = new Nexus();
      container.set(USER_SERVICE, UserService);
      const userService = container.get(USER_SERVICE) as UserService;
      expect(userService.getUsers()).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });

  // Invalid provider configuration: should throw if provider is missing all strategies
  describe('Provider edge cases', () => {
    /**
     * Test: Invalid provider configuration
     * Validates: Throws error if provider has no useClass, useValue, or useFactory
     * Value: Ensures misconfigured providers are caught early
     */
    it('should throw if provider is missing useClass, useValue, and useFactory', () => {
      class Invalid {}
      expect(() => nexus.set(Invalid, {} as any)).toThrowError(InvalidProvider);
    });

    /**
     * Test: Alias handling
     * Validates: Class and alias resolve to the same instance
     * Value: Ensures aliases work for DI
     */
    it('should resolve class and alias to the same instance', () => {
      @Service()
      class AliasService {
        getValue() {
          return 42;
        }
      }
      const ALIAS = Symbol('ALIAS');
      nexus.set(ALIAS, { useClass: AliasService });
      const instance1 = nexus.get(ALIAS) as AliasService;
      const instance2 = nexus.get(AliasService);
      expect(instance1).toBe(instance2);
      expect(instance1.getValue()).toBe(42);
    });

    /**
     * Test: Overwriting providers
     * Validates: Last provider registered for a token wins
     * Value: Ensures predictable provider overriding
     */
    it('should allow overwriting providers for the same token', () => {
      const TOKEN = new Token<number>('OVERRIDE');
      nexus.set(TOKEN, { useValue: 1 });
      expect(nexus.get(TOKEN)).toBe(1);
      nexus.set(TOKEN, { useValue: 2 });
      expect(nexus.get(TOKEN)).toBe(2);
    });

    /**
     * Test: Registering undecorated class in a module
     * Validates: Throws error if class is not decorated with @Service/@Provider
     * Value: Prevents accidental registration of undecorated classes
     */
    it('should throw if registering undecorated class in a module', () => {
      class NotAService {}
      @Module({ services: [NotAService] })
      class Mod {}
      expect(() => nexus.set(Mod)).toThrowError(InvalidService);
    });
  });

  // Circular module imports: should not stack overflow
  describe('Module import edge cases', () => {
    /**
     * Test: Circular module imports
     * Validates: Container does not stack overflow or infinite loop
     * Value: Ensures robust module import handling
     */
    it('should handle circular module imports gracefully', () => {
      @Module({ imports: [] })
      class A {}
      @Module({ imports: [A] })
      class B {}
      // Create circular reference
      (A as any).imports = [B];
      // Should not throw
      nexus.set(A);
      nexus.set(B);
      expect(nexus.has(A)).toBe(true);
      expect(nexus.has(B)).toBe(true);
    });
  });

  // Property injection: using @Inject on a property
  describe('Property injection', () => {
    /**
     * Test: Property injection with @Inject
     * Validates: Property is injected after instantiation
     * Value: Enables property-based DI
     */
    it('should inject property with @Inject', () => {
      @Service()
      class Dep {
        value = 123;
      }
      @Service()
      class Consumer {
        @Inject(Dep) dep!: Dep;
      }
      nexus.set(Dep, { useClass: Dep });
      nexus.set(Consumer, { useClass: Consumer });
      const consumer = nexus.get(Consumer) as Consumer;
      expect(consumer.dep).toBeInstanceOf(Dep);
      expect(consumer.dep.value).toBe(123);
    });
  });
});
