import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Nexus, Module, Service, Provider, Inject, Token } from './index';

describe('Nexus', () => {
  let nexus: Nexus;

  beforeEach(() => {
    nexus = new Nexus();
  });

  describe('Basic functionality', () => {
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
    it('should throw error for unregistered token', () => {
      expect(() => nexus.get('UNREGISTERED_TOKEN')).toThrow(
        'No provider found for token: UNREGISTERED_TOKEN'
      );
    });
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

  describe('Dependency injection', () => {
    it('should inject dependencies automatically', () => {
      @Service()
      class LoggerService {
        log(message: string): string {
          return `[LOG] ${message}`;
        }
      }
      @Service()
      class UserServiceWithLogger {
        constructor(@Inject(LoggerService) private logger: LoggerService) {}
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

  describe('Custom tokens and providers', () => {
    it('should work with custom tokens', () => {
      const API_URL = 'API_URL';
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
    it('should work with factory providers', () => {
      const factory = vi.fn().mockReturnValue('factory-result');
      nexus.set('FACTORY_TOKEN', {
        useFactory: factory,
      });
      const result = nexus.get('FACTORY_TOKEN');
      expect(result).toBe('factory-result');
      expect(factory).toHaveBeenCalledTimes(1);
    });
    it('should work with factory providers with dependencies', () => {
      const DEP1 = 'DEP1';
      const DEP2 = 'DEP2';
      const FACTORY_TOKEN = 'FACTORY_WITH_DEPS';
      
      // Register dependencies
      nexus.set(DEP1, { useValue: 'dependency1' });
      nexus.set(DEP2, { useValue: 'dependency2' });
      
      // Create factory that expects dependencies
      const factory = vi.fn().mockImplementation((dep1: string, dep2: string) => {
        return `${dep1}-${dep2}-result`;
      });
      
      // Register factory with dependencies
      nexus.set(FACTORY_TOKEN, {
        useFactory: factory,
        deps: [DEP1, DEP2]
      });
      
      const result = nexus.get(FACTORY_TOKEN);
      expect(result).toBe('dependency1-dependency2-result');
      expect(factory).toHaveBeenCalledWith('dependency1', 'dependency2');
    });
    it('should work with auto-generated tokens', () => {
      const autoToken = new Token();
      nexus.set(autoToken, {
        useValue: 'auto-generated-value',
      });
      const result = nexus.get(autoToken);
      expect(result).toBe('auto-generated-value');
    });
  });

  describe('Module registration', () => {
    it('should register module and its services', () => {
      @Service()
      class LoggerService {
        log(message: string): string {
          return `[LOG] ${message}`;
        }
      }
      @Service()
      class UserServiceWithLogger {
        constructor(@Inject(LoggerService) private logger: LoggerService) {}
        getUser(id: string): string {
          return this.logger.log(`Getting user ${id}`);
        }
      }
      @Module({
        services: [LoggerService, UserServiceWithLogger],
      })
      class AppModule {}
      nexus.setModule(AppModule);
      expect(nexus.has(LoggerService)).toBe(true);
      expect(nexus.has(UserServiceWithLogger)).toBe(true);
      const userService = nexus.get(UserServiceWithLogger);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  describe('Child containers', () => {
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

  describe('Container lifecycle', () => {
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

  describe('Homepage Example', () => {
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
      expect(userService).toBeInstanceOf(UserService);
      expect(userService.getUsers()).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });
}); 