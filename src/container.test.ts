import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Nexus, Module, Service, Provider, Inject, Token } from './index';

describe('Nexus', () => {
  let nexus: Nexus;

  beforeEach(() => {
    nexus = new Nexus();
  });

  describe('Basic functionality', () => {
    @Service()
    class TestService {
      getMessage(): string {
        return 'Hello World';
      }
    }

    it('should register and resolve a service', () => {
      nexus.set(TestService, {
        useClass: TestService,
      });

      const service = nexus.get(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getMessage()).toBe('Hello World');
    });

    it('should return singleton instances', () => {
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
      expect(nexus.has(TestService)).toBe(false);
      
      nexus.set(TestService, {
        useClass: TestService,
      });
      
      expect(nexus.has(TestService)).toBe(true);
    });
  });

  describe('Dependency injection', () => {
    @Service()
    class LoggerService {
      log(message: string): string {
        return `[LOG] ${message}`;
      }
    }

    @Service()
    class UserService {
      constructor(@Inject(LoggerService) private logger: LoggerService) {}

      getUser(id: string): string {
        return this.logger.log(`Getting user ${id}`);
      }
    }

    it('should inject dependencies automatically', () => {
      nexus.set(LoggerService, {
        useClass: LoggerService,
      });

      nexus.set(UserService, {
        useClass: UserService,
      });

      const userService = nexus.get(UserService);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  describe('Custom tokens and providers', () => {
    const API_URL = 'API_URL';
    const CONFIG_TOKEN = new Token('CONFIG');

    @Provider(CONFIG_TOKEN)
    class ConfigService {
      constructor(@Inject(API_URL) private apiUrl: string) {}

      getApiUrl(): string {
        return this.apiUrl;
      }
    }

    it('should work with custom tokens', () => {
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
    @Service()
    class LoggerService {
      log(message: string): string {
        return `[LOG] ${message}`;
      }
    }

    @Service()
    class UserService {
      constructor(@Inject(LoggerService) private logger: LoggerService) {}

      getUser(id: string): string {
        return this.logger.log(`Getting user ${id}`);
      }
    }

    @Module({
      services: [LoggerService, UserService],
    })
    class AppModule {}

    it('should register module and its services', () => {
      nexus.registerModule(AppModule);

      expect(nexus.has(LoggerService)).toBe(true);
      expect(nexus.has(UserService)).toBe(true);

      const userService = nexus.get(UserService);
      expect(userService.getUser('123')).toBe('[LOG] Getting user 123');
    });
  });

  describe('Child containers', () => {
    @Service()
    class ParentService {
      getMessage(): string {
        return 'parent';
      }
    }

    it('should inherit from parent container', () => {
      nexus.set(ParentService, {
        useClass: ParentService,
      });

      const child = nexus.createChildContainer();
      expect(child.has(ParentService)).toBe(true);

      const service = child.get(ParentService);
      expect(service.getMessage()).toBe('parent');
    });

    it('should allow overriding in child container', () => {
      nexus.set(ParentService, {
        useClass: ParentService,
      });

      const child = nexus.createChildContainer();
      
      @Service()
      class ChildService {
        getMessage(): string {
          return 'child';
        }
      }

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
      class TestService {
        getMessage(): string {
          return 'test';
        }
      }

      nexus.set(TestService, {
        useClass: TestService,
      });

      expect(nexus.has(TestService)).toBe(true);

      nexus.clear();

      expect(nexus.has(TestService)).toBe(false);
    });
  });
}); 