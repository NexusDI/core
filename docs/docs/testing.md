---
sidebar_position: 2
---

# Testing

NexusDI is designed with testing in mind, making it easy to create isolated, maintainable tests for your applications. This guide covers testing strategies, mocking techniques, and best practices.

## Why Testing is Easy with NexusDI

Dependency injection makes testing much easier because:

- **Dependencies are explicit**: All dependencies are clearly defined through tokens and injection
- **Easy mocking**: Replace real implementations with test doubles
- **Isolation**: Test individual components without external dependencies
- **Configuration flexibility**: Use different configurations for different test scenarios

## Unit Testing

### Basic Service Testing

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Nexus, Service, Token, Inject } from '@nexusdi/core';

// Define tokens
const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
const DATABASE = new Token<IDatabase>('DATABASE');

// Service to test
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDatabase) {}

  async getUser(id: string): Promise<User> {
    return this.database.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

describe('UserService', () => {
  let container: Nexus;
  let mockDatabase: IDatabase;

  beforeEach(() => {
    container = new Nexus();
    mockDatabase = {
      query: vi.fn(),
    };

    // Register the service with mock dependencies
    container.set(DATABASE, { useValue: mockDatabase });
    container.set(USER_SERVICE, { useClass: UserService });
  });

  it('should get user by id', async () => {
    const mockUser = { id: '123', name: 'John Doe' };
    mockDatabase.query.mockResolvedValue(mockUser);

    const userService = container.get(USER_SERVICE);
    const result = await userService.getUser('123');

    expect(result).toEqual(mockUser);
    expect(mockDatabase.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE id = ?',
      ['123']
    );
  });
});
```

### Testing with Different Mock Implementations

```typescript
describe('UserService with different mocks', () => {
  it('should handle database errors', async () => {
    const container = new Nexus();
    const errorDatabase = {
      query: vi.fn().mockRejectedValue(new Error('Database connection failed')),
    };

    container.set(DATABASE, { useValue: errorDatabase });
    container.set(USER_SERVICE, { useClass: UserService });

    const userService = container.get(USER_SERVICE);

    await expect(userService.getUser('123')).rejects.toThrow(
      'Database connection failed'
    );
  });

  it('should handle empty results', async () => {
    const container = new Nexus();
    const emptyDatabase = {
      query: vi.fn().mockResolvedValue(null),
    };

    container.set(DATABASE, { useValue: emptyDatabase });
    container.set(USER_SERVICE, { useClass: UserService });

    const userService = container.get(USER_SERVICE);
    const result = await userService.getUser('999');

    expect(result).toBeNull();
  });
});
```

## Module Testing

### Testing Individual Modules

```typescript
import { Module, Service, Token, Inject } from '@nexusdi/core';

const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
const DATABASE = new Token<IDatabase>('DATABASE');
const LOGGER = new Token<ILogger>('LOGGER');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async getUser(id: string): Promise<User> {
    this.logger.info(`Fetching user ${id}`);
    return this.database.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useClass: InMemoryDatabase },
    { token: LOGGER, useClass: ConsoleLogger },
  ],
})
class UserModule {}

describe('UserModule', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('should register all services and providers', () => {
    container.set(USER_SERVICE, { useClass: UserService });

    expect(container.has(USER_SERVICE)).toBe(true);
    expect(container.has(DATABASE)).toBe(true);
    expect(container.has(LOGGER)).toBe(true);
  });

  it('should resolve UserService with dependencies', () => {
    container.set(USER_SERVICE, { useClass: UserService });

    const userService = container.get(USER_SERVICE);
    expect(userService).toBeInstanceOf(UserService);
  });
});
```

### Testing with Mock Modules

```typescript
// Create a test module with mocked dependencies
@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useValue: mockDatabase },
    { token: LOGGER, useValue: mockLogger },
  ],
})
class TestUserModule {}

describe('UserModule with mocks', () => {
  let container: Nexus;
  let mockDatabase: IDatabase;
  let mockLogger: ILogger;

  beforeEach(() => {
    container = new Nexus();
    mockDatabase = {
      query: vi.fn(),
    };
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  it('should use mocked dependencies', async () => {
    container.set(USER_SERVICE, { useClass: UserService });

    const mockUser = { id: '123', name: 'John' };
    mockDatabase.query.mockResolvedValue(mockUser);

    const userService = container.get(USER_SERVICE);
    const result = await userService.getUser('123');

    expect(result).toEqual(mockUser);
    expect(mockLogger.info).toHaveBeenCalledWith('Fetching user 123');
  });
});
```

## Dynamic Module Testing

### Testing with Different Configurations

```typescript
import { Module, DynamicModule, Token } from '@nexusdi/core';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
}

const DATABASE_CONFIG = new Token<DatabaseConfig>('DATABASE_CONFIG');

@Module({
  services: [DatabaseService],
  providers: [{ token: DATABASE_CONFIG, useValue: {} }],
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
}

describe('DatabaseModule', () => {
  it('should work with test configuration', () => {
    const container = new Nexus();
    container.set(DATABASE_CONFIG, {
      useValue: {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
      },
    });

    const databaseService = container.get(DATABASE_SERVICE);
    expect(databaseService).toBeInstanceOf(DatabaseService);
  });

  it('should validate configuration', () => {
    expect(() => {
      const container = new Nexus();
      container.set(DATABASE_CONFIG, { useValue: {} });
    }).toThrow('Database host is required');
  });

  it('should work with async configuration', async () => {
    const container = new Nexus();
    await container.set(DATABASE_CONFIG, {
      useValue: {
        host: 'test-host',
        port: 5432,
        database: 'test_db',
      },
    });

    const databaseService = container.get(DATABASE_SERVICE);
    expect(databaseService).toBeInstanceOf(DatabaseService);
  });
});
```

## Integration Testing

### Testing Multiple Modules Together

```typescript
@Module({
  services: [UserService],
  providers: [{ token: DATABASE, useClass: PostgresDatabase }],
})
class UserModule {}

@Module({
  services: [EmailService],
  providers: [{ token: EMAIL_CONFIG, useValue: emailConfig }],
})
class EmailModule {}

@Module({
  imports: [UserModule, EmailModule],
  services: [AppService],
})
class AppModule {}

describe('App Integration', () => {
  it('should work with real database and mocked email', async () => {
    const container = new Nexus();

    // Use real database for integration testing
    container.set(USER_SERVICE, { useClass: UserService });

    // Mock email service
    container.set(EMAIL_SERVICE, { useValue: mockEmailService });

    const appService = container.get(APP_SERVICE);
    const result = await appService.createUser({
      name: 'John',
      email: 'john@example.com',
    });

    expect(result).toBeDefined();
    expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
      'john@example.com'
    );
  });
});
```

## Testing Utilities

### Creating Test Containers

```typescript
// Test utility function
function createTestContainer(overrides: Record<string, any> = {}) {
  const container = new Nexus();

  // Register default test implementations
  container.set(DATABASE, { useValue: createMockDatabase() });
  container.set(LOGGER, { useValue: createMockLogger() });
  container.set(EMAIL_SERVICE, { useValue: createMockEmailService() });

  // Apply overrides
  Object.entries(overrides).forEach(([token, provider]) => {
    container.set(token, provider);
  });

  return container;
}

describe('UserService with test utilities', () => {
  it('should work with default mocks', () => {
    const container = createTestContainer();
    container.set(USER_SERVICE, { useClass: UserService });

    const userService = container.get(USER_SERVICE);
    expect(userService).toBeInstanceOf(UserService);
  });

  it('should work with custom mocks', () => {
    const customDatabase = { query: vi.fn().mockResolvedValue({ id: '123' }) };
    const container = createTestContainer({
      [DATABASE]: { useValue: customDatabase },
    });
    container.set(USER_SERVICE, { useClass: UserService });

    const userService = container.get(USER_SERVICE);
    expect(userService).toBeInstanceOf(UserService);
  });
});
```

### Testing with Child Containers

```typescript
describe('Child Container Testing', () => {
  let parentContainer: Nexus;

  beforeEach(() => {
    parentContainer = new Nexus();
    parentContainer.set(DATABASE, { useClass: PostgresDatabase });
    parentContainer.set(LOGGER, { useClass: ConsoleLogger });
  });

  it('should inherit from parent container', () => {
    const childContainer = parentContainer.createChildContainer();
    childContainer.set(USER_SERVICE, { useClass: UserService });

    expect(childContainer.has(DATABASE)).toBe(true);
    expect(childContainer.has(LOGGER)).toBe(true);
    expect(childContainer.has(USER_SERVICE)).toBe(true);
  });

  it('should allow overriding in child container', () => {
    const childContainer = parentContainer.createChildContainer();
    const mockDatabase = { query: vi.fn() };

    childContainer.set(DATABASE, { useValue: mockDatabase });
    childContainer.set(USER_SERVICE, { useClass: UserService });

    const userService = childContainer.get(USER_SERVICE);
    expect(userService).toBeInstanceOf(UserService);

    // Child uses mock, parent still uses real database
    const parentUserService = parentContainer.get(USER_SERVICE);
    expect(parentUserService).toBeInstanceOf(UserService);
  });
});
```

## Best Practices

### 1. Use Explicit Tokens

```typescript
// ✅ Good - explicit tokens make testing easier
const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
const DATABASE = new Token<IDatabase>('DATABASE');

// ❌ Bad - hard to mock and test
class UserService {
  constructor(private database: PostgresDatabase) {}
}
```

### 2. Mock at the Right Level

```typescript
// ✅ Good - mock the interface, not the implementation
container.set(DATABASE, { useValue: mockDatabase });

// ❌ Bad - mocking implementation details
container.set(PostgresDatabase, { useValue: mockPostgresDatabase });
```

### 3. Test Configuration Validation

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

Configuration validation will be supported with dynamic module configuration in future releases.

```typescript
describe('Module Configuration', () => {
  it('should validate required configuration', () => {
    expect(() => {
      DatabaseModule.config({} as DatabaseConfig);
    }).toThrow('Database host is required');
  });
});
```

</details>

For now, you can test configuration validation manually:

```typescript
describe('Module Configuration', () => {
  it('should validate required configuration', () => {
    expect(() => {
      // Test with invalid configuration
      const container = new Nexus();
      container.set(DATABASE_CONFIG, { useValue: {} }); // Missing required fields
      container.set(DATABASE_SERVICE, { useClass: DatabaseService });
      container.get(DATABASE_SERVICE); // This should fail
    }).toThrow();
  });
});
```

### 4. Use Test-Specific Modules

```typescript
// Create test-specific modules for different scenarios
@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useValue: inMemoryDatabase },
    { token: LOGGER, useValue: silentLogger },
  ],
})
class TestUserModule {}
```

### 5. Test Error Scenarios

```typescript
describe('Error Handling', () => {
  it('should handle database connection failures', async () => {
    const container = createTestContainer({
      [DATABASE]: { useValue: failingDatabase },
    });

    const userService = container.get(USER_SERVICE);
    await expect(userService.getUser('123')).rejects.toThrow(
      'Connection failed'
    );
  });
});
```

## Summary

Testing with NexusDI is straightforward and powerful:

- **Unit Testing**: Mock dependencies easily with tokens
- **Module Testing**: Test modules in isolation with mock providers
- **Integration Testing**: Combine real and mocked dependencies
- **Dynamic Modules**: Test different configurations and validation
- **Child Containers**: Test inheritance and override scenarios

The key is to use tokens and interfaces, which makes your code both more testable and more maintainable.

## Next Steps

- **[Module Basics](modules/module-basics.md)** - How to organize services into modules
- **[Advanced](advanced/advanced.md)** - Advanced testing patterns and techniques
- **[Best Practices](best-practices.md)** - Testing best practices and guidelines
