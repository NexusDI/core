/**
 * Example: Testing DI Code with NexusDI
 * 
 * This file demonstrates testing patterns for dependency injection code
 * without requiring external testing dependencies to be installed.
 * 
 * Key concepts:
 * 1. Mock the container and services
 * 2. Test service interfaces, not implementations
 * 3. Test route loaders and actions with mocked dependencies
 * 4. Use type-safe mocks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Nexus } from '../../../../../../src';
import { LoggerService, LOGGER_SERVICE_TOKEN } from '../../app/modules/logger/logger.service';
import { UserService, USER_SERVICE_TOKEN } from '../../app/modules/users/user.service';
import { USERS_CONFIG_TOKEN } from '../../app/modules/users/users.types';
import { LoggerModule } from '../../app/modules/logger/logger.module';
import { UsersModule } from '../../app/modules/users/users.module';
import type { LoggerConfig } from '../../app/modules/logger/logger.types';
import type { UsersConfig } from '../../app/modules/users/users.types';

describe('Dynamic Module Configuration Examples', () => {
  describe('Logger Module Configuration', () => {
    it('should configure logger for development', () => {
      const container = new Nexus();
      container.registerDynamicModule(LoggerModule.config({
        level: 'debug',
        format: 'text',
        enableConsole: true,
        enableFile: false,
      }));

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      
      // Test that debug messages are logged in development
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      logger.debug('Test debug message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should configure logger for production', () => {
      const container = new Nexus();
      container.registerDynamicModule(LoggerModule.config({
        level: 'info',
        format: 'json',
        enableConsole: true,
        enableFile: true,
        filePath: '/var/log/app.log',
      }));

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      
      // Test that debug messages are NOT logged in production
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      logger.debug('Test debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should configure logger for testing', () => {
      const container = new Nexus();
      container.registerDynamicModule(LoggerModule.config({
        level: 'error',
        format: 'minimal',
        enableConsole: false,
        enableFile: false,
      }));

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      
      // Test that only error messages are logged in testing
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Test info message');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should use custom configuration', () => {
      const customConfig: LoggerConfig = {
        level: 'warn',
        format: 'json',
        enableConsole: true,
        enableFile: false,
      };

      const container = new Nexus();
      container.registerDynamicModule(LoggerModule.config(customConfig));

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      
      // Test that info messages are NOT logged with warn level
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Test info message');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Users Module Configuration', () => {
    it('should configure users for development', async () => {
      const container = new Nexus();
      container.registerDynamicModule(UsersModule.config({
        apiUrl: 'http://localhost:3001/api/users',
        cacheEnabled: false,
        cacheTTL: 300,
        maxUsersPerPage: 10,
        enableMockData: true,
      }));

      const userService = container.get(USER_SERVICE_TOKEN);
      expect(userService).toBeDefined();

      const users = await userService.getUsers();
      expect(users).toHaveLength(5); // Mock data returns 5 users
    });

    it('should configure users for production', async () => {
      const container = new Nexus();
      container.registerDynamicModule(UsersModule.config({
        apiUrl: 'https://api.example.com/users',
        cacheEnabled: true,
        cacheTTL: 3600,
        maxUsersPerPage: 50,
        enableMockData: false,
      }));

      const userService = container.get(USER_SERVICE_TOKEN);
      expect(userService).toBeDefined();

      const users = await userService.getUsers();
      expect(users).toHaveLength(3); // API simulation returns 3 users
    });

    it('should configure users for testing', async () => {
      const container = new Nexus();
      container.registerDynamicModule(UsersModule.config({
        apiUrl: 'http://localhost:3001/api/users',
        cacheEnabled: false,
        cacheTTL: 0,
        maxUsersPerPage: 5,
        enableMockData: true,
      }));

      const userService = container.get(USER_SERVICE_TOKEN);
      expect(userService).toBeDefined();

      const users = await userService.getUsers(1, 5);
      expect(users).toHaveLength(5); // Limited to 5 users in testing
    });

    it('should use custom configuration', async () => {
      const customConfig: UsersConfig = {
        apiUrl: 'https://custom-api.example.com/users',
        cacheEnabled: true,
        cacheTTL: 1800,
        maxUsersPerPage: 25,
        enableMockData: false,
      };

      const container = new Nexus();
      container.registerDynamicModule(UsersModule.config(customConfig));

      const userService = container.get(USER_SERVICE_TOKEN);
      expect(userService).toBeDefined();

      const users = await userService.getUsers();
      expect(users).toHaveLength(3); // API simulation returns 3 users
    });
  });

  describe('Environment-Based Configuration', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should configure for development environment', () => {
      process.env.NODE_ENV = 'development';
      
      const container = new Nexus();
      
      // Simulate environment-based configuration
      const env = process.env.NODE_ENV;
      if (env === 'development') {
        container.registerDynamicModule(LoggerModule.config({
          level: 'debug',
          format: 'text',
          enableConsole: true,
          enableFile: false,
        }));
        container.registerDynamicModule(UsersModule.config({
          apiUrl: 'http://localhost:3001/api/users',
          cacheEnabled: false,
          cacheTTL: 300,
          maxUsersPerPage: 10,
          enableMockData: true,
        }));
      }

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      const userService = container.get(USER_SERVICE_TOKEN);
      
      expect(logger).toBeDefined();
      expect(userService).toBeDefined();
    });

    it('should configure for production environment', () => {
      process.env.NODE_ENV = 'production';
      
      const container = new Nexus();
      
      // Simulate environment-based configuration
      const env = process.env.NODE_ENV;
      if (env === 'production') {
        container.registerDynamicModule(LoggerModule.config({
          level: 'info',
          format: 'json',
          enableConsole: true,
          enableFile: true,
          filePath: '/var/log/app.log',
        }));
        container.registerDynamicModule(UsersModule.config({
          apiUrl: 'https://api.example.com/users',
          cacheEnabled: true,
          cacheTTL: 3600,
          maxUsersPerPage: 50,
          enableMockData: false,
        }));
      }

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      const userService = container.get(USER_SERVICE_TOKEN);
      
      expect(logger).toBeDefined();
      expect(userService).toBeDefined();
    });

    it('should configure for testing environment', () => {
      process.env.NODE_ENV = 'test';
      
      const container = new Nexus();
      
      // Simulate environment-based configuration
      const env = process.env.NODE_ENV;
      if (env === 'test') {
        container.registerDynamicModule(LoggerModule.config({
          level: 'error',
          format: 'minimal',
          enableConsole: false,
          enableFile: false,
        }));
        container.registerDynamicModule(UsersModule.config({
          apiUrl: 'http://localhost:3001/api/users',
          cacheEnabled: false,
          cacheTTL: 0,
          maxUsersPerPage: 5,
          enableMockData: true,
        }));
      }

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      const userService = container.get(USER_SERVICE_TOKEN);
      
      expect(logger).toBeDefined();
      expect(userService).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate logger configuration', () => {
      const container = new Nexus();
      
      // This should work
      expect(() => {
        container.registerDynamicModule(LoggerModule.config({
          level: 'info',
          format: 'text',
          enableConsole: true,
        }));
      }).not.toThrow();

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
    });

    it('should validate users configuration', () => {
      const container = new Nexus();
      
      // This should work
      expect(() => {
        container.registerDynamicModule(UsersModule.config({
          apiUrl: 'https://api.example.com/users',
          cacheEnabled: true,
          cacheTTL: 3600,
          maxUsersPerPage: 50,
        }));
      }).not.toThrow();

      const userService = container.get(USER_SERVICE_TOKEN);
      expect(userService).toBeDefined();
    });
  });

  describe('Provider Registration Formats', () => {
    it('should work with simplified provider format', () => {
      const container = new Nexus();
      
      // Simplified format - just the service class
      container.registerDynamicModule({
        providers: [LoggerService], // Uses @Service decorator token automatically
      });

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(LoggerService);
    });

    it('should work with full provider format', () => {
      const container = new Nexus();
      
      // Full format - explicit token and provider
      container.registerDynamicModule({
        providers: [
          { token: LOGGER_SERVICE_TOKEN, useClass: LoggerService },
        ],
      });

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(LoggerService);
    });

    it('should work with mixed formats', () => {
      const container = new Nexus();
      
      // Mixed format - both simplified and full provider objects
      container.registerDynamicModule({
        providers: [
          LoggerService, // Simplified format
          { token: USERS_CONFIG_TOKEN, useValue: { apiUrl: 'test' } }, // Full format for config
        ],
      });

      const logger = container.get(LOGGER_SERVICE_TOKEN);
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(LoggerService);
    });
  });
});

// Example 1: Testing a Service with Mocked Dependencies
export function exampleServiceTest() {
  // Mock the container
  const mockContainer = {
    get: (token: string) => {},
    has: (token: string) => {},
    register: (token: string, value: unknown) => {},
  };

  // Mock the logger service
  const mockLogger = {
    info: (prop: unknown) => {},
    warn: (prop: unknown) => {},
    error: (prop: unknown) => {},
  };

  // Test service registration
  mockContainer.register('LoggerService', mockLogger);
  // Assert: mockContainer.register should have been called with 'LoggerService' and mockLogger

  // Test service retrieval
  const logger = mockContainer.get('LoggerService');
  // Assert: logger should be mockLogger

  // Test service method calls
  // @ts-expect-error - Mocking the logger service
  logger.info('Test message');
  // Assert: logger.info should have been called with 'Test message'
}

// Example 2: Testing Route Loader with Mocked Container
export async function exampleLoaderTest() {
  const mockContainer = {
    has: (token: string) => true,
    get: (token: string) => {
      if (token === 'LOGGER_SERVICE_TOKEN') return mockLogger;
      if (token === 'USER_SERVICE_TOKEN') return mockUserService;
      return null;
    },
  };

  const mockLogger = {
    info: (prop: unknown) => {},
  };

  const mockUserService = {
    getUsers: async () => [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
    ],
  };

  // Mock context
  const mockContext = {
    get: (token: string) => mockContainer,
  };

  // Test loader function (pseudo-code)
  async function testLoader() {
    const container = mockContext.get('container');
    const logger = container.get('LOGGER_SERVICE_TOKEN');
    const userService = container.get('USER_SERVICE_TOKEN');

    // @ts-expect-error - Mocking the logger service
    logger.info('Page loaded');
    // @ts-expect-error - Mocking the user service
    const users = await userService.getUsers();

    return {
      hasLogger: container.has('LOGGER_SERVICE_TOKEN'),
      hasUserService: container.has('USER_SERVICE_TOKEN'),
      users,
    };
  }

  // Expected result
  const result = await testLoader();
  // Assert: result.hasLogger should be true
  // Assert: result.hasUserService should be true
  // Assert: result.users should have length 1
}

// Example 3: Testing Route Action with Form Data
export async function exampleActionTest() {
  const mockContainer = {
    get: (token: string) => mockLogger,
  };

  const mockLogger = {
    info: (prop: unknown) => {},
  };

  // Test action function (pseudo-code)
  async function testAction() {
    const formData = new FormData();
    formData.append('intent', 'logMessage');

    const intent = formData.get('intent');
    const logger = mockContainer.get('LOGGER_SERVICE_TOKEN');

    if (intent === 'logMessage') {
      logger.info('Button clicked: Log a Message');
      return { message: 'Logged a message to the console.' };
    }

    return { message: 'Unknown intent' };
  }

  // Expected result
  const result = await testAction();
  // Assert: result.message should be 'Logged a message to the console.'
}

// Example 4: Testing Error Scenarios
export function exampleErrorTest() {
  const mockContainer = {
    get: (token: string) => {
      throw new Error('Service not found');
    },
    has: (token: string) => false,
  };

  // Test error handling (pseudo-code)
  function testErrorHandling() {
    try {
      const service = mockContainer.get('NON_EXISTENT_SERVICE');
      return { success: true, service };
    } catch (error) {
      return {
        success: false,
        hasService: mockContainer.has('NON_EXISTENT_SERVICE'),
        error: (error as Error).message,
      };
    }
  }

  // Expected result
  const result = testErrorHandling();
  // Assert: result.success should be false
  // Assert: result.hasService should be false
  // Assert: result.error should be 'Service not found'
}

// Example 5: Testing Middleware
export function exampleMiddlewareTest() {
  const mockContainer = {
    get: () => {},
  };

  const mockContext = {
    set: (token: string, value: unknown) => {},
  };

  const mockNext = async () => new Response();

  // Test middleware function (pseudo-code)
  async function testMiddleware() {
    const container = mockContainer;
    mockContext.set('container', container);
    
    const response = await mockNext();
    return response;
  }

  // Expected behavior
  testMiddleware();
  // Assert: mockContext.set should have been called with 'container' and mockContainer
  // Assert: mockNext should have been called
}

/**
 * Key Testing Patterns:
 * 
 * 1. **Mock at the Right Level**
 *    - Unit tests: Mock external dependencies
 *    - Integration tests: Use real container with mocked services
 *    - E2E tests: Mock at API level
 * 
 * 2. **Test Interfaces, Not Implementations**
 *    - Mock service interfaces
 *    - Test method calls and return values
 *    - Verify service interactions
 * 
 * 3. **Use Type-Safe Mocks**
 *    - Create typed mock objects
 *    - Use proper TypeScript interfaces
 *    - Maintain type safety in tests
 * 
 * 4. **Test Error Scenarios**
 *    - Service not found
 *    - Network errors
 *    - Invalid data
 *    - Graceful degradation
 * 
 * 5. **Test Integration Points**
 *    - Route loaders and actions
 *    - Middleware
 *    - Container registration and retrieval
 *    - Context sharing
 * 
 * 6. **Testing with Vitest**
 *    - Use vi.fn() for mocks
 *    - Use vi.mock() for module mocking
 *    - Use expect() for assertions
 *    - Use @testing-library/react for component testing
 *    - Use MSW for API mocking in e2e tests
 */ 