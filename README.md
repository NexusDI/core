# NexusDI

A modern, simple, and adaptive dependency injection container for TypeScript, inspired by Nest.js, TypeDI, and Angular.

## Features

- 🚀 **Modern API** - Clean, intuitive decorators and fluent interface
- 🔒 **Type Safety** - Full TypeScript support with generics
- 🎯 **Token-based** - Use tokens with interfaces for better flexibility
- 🧪 **Testable** - Easy mocking and testing with interface-based dependencies
- 📦 **Modular** - Organize code with modules and providers
- ⚡ **Lightweight** - Minimal overhead, maximum performance
- 🔧 **Flexible** - Multiple injection patterns and provider types

## Quick Start

### Installation

```bash
npm install @nexusdi/core
```

### Basic Usage with Tokens and Interfaces

NexusDI promotes using tokens with interfaces for better flexibility and maintainability:

```typescript
import { Nexus, Service, Inject, Token } from '@nexusdi/core';

// Define interfaces for better contracts
interface ILogger {
  log(message: string): void;
}

interface IUserService {
  getUser(id: string): Promise<User>;
}

interface IDataSource {
  query(sql: string): Promise<any>;
}

// Create tokens for type-safe dependency injection
export const LOGGER = new Token<ILogger>('LOGGER');
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDataSource>('DATABASE');

// Implement services using interfaces and tokens
@Service(LOGGER)
class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

@Service(DATABASE)
class InMemoryDatabase implements IDataSource {
  async query(sql: string): Promise<any> {
    return [{ id: '1', name: 'John Doe' }];
  }
}

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async getUser(id: string): Promise<User> {
    this.logger.log(`Fetching user: ${id}`);
    const result = await this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
    return result[0];
  }
}

// Set up container
const nexus = new Nexus();
nexus.set(LOGGER, { useClass: ConsoleLogger });
nexus.set(DATABASE, { useClass: InMemoryDatabase });
nexus.set(USER_SERVICE, { useClass: UserService });

// Use services
const userService = nexus.get(USER_SERVICE);
const user = await userService.getUser('1');
```

## Why Tokens + Interfaces?

Using tokens with interfaces provides several benefits:

### 1. **Interface-Driven Development**
Your code depends on contracts, not implementations:

```typescript
// ✅ Good - depends on interface
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDataSource) {}
}

// ❌ Bad - depends on concrete implementation
class UserService {
  constructor(private database: PostgresDatabase) {}
}
```

### 2. **Easy Testing**
Mock dependencies easily with interface-based tokens:

```typescript
const mockDatabase = {
  query: vi.fn().mockReturnValue([{ id: '123', name: 'John' }])
};

nexus.set(DATABASE, { useValue: mockDatabase });
const userService = nexus.get(USER_SERVICE);
```

### 3. **Flexible Configuration**
Switch implementations without changing your business logic:

```typescript
// Development
nexus.set(DATABASE, { useClass: InMemoryDatabase });

// Production
nexus.set(DATABASE, { useClass: PostgresDatabase });
```

## Core Concepts

### Tokens

Tokens are unique identifiers for dependencies. They can be created with optional string identifiers and provide type safety:

```typescript
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDataSource>('DATABASE');
export const API_KEY = new Token<string>('API_KEY');
```

### Services

Services are classes that can be injected and managed by the container:

```typescript
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDataSource) {}
}
```

### Providers

Providers define how dependencies are created and managed:

```typescript
// Class provider
nexus.set(USER_SERVICE, { useClass: UserService });

// Value provider
nexus.set(API_KEY, { useValue: 'your-api-key' });

// Factory provider
nexus.set(DATABASE, {
  useFactory: () => new PostgresDatabase(config)
});
```

### Modules

Modules help organize related services and providers:

```typescript
@Module({
  services: [UserService, UserRepository],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase }
  ]
})
class UserModule {}
```

## Injection Patterns

### Constructor Injection (Recommended)

```typescript
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

### Property Injection

```typescript
@Service(USER_SERVICE)
class UserService implements IUserService {
  @Inject(DATABASE)
  private database!: IDataSource;
  
  @Inject(LOGGER)
  private logger!: ILogger;
}
```

### Method Injection

```typescript
@Service(USER_SERVICE)
class UserService implements IUserService {
  processUser(@Inject(DATABASE) database: IDataSource, userId: string) {
    return database.query(`SELECT * FROM users WHERE id = '${userId}'`);
  }
}
```

## Advanced Features

### Child Containers

Create isolated containers that inherit from parent containers:

```typescript
const parentNexus = new Nexus();
parentNexus.registerModule(AppModule);

const childNexus = parentNexus.createChildContainer();
childNexus.set(LOGGER, { token: LOGGER, useClass: TestLogger });
```

### Factory Dependencies

Inject dependencies into factory functions:

```typescript
nexus.set(EMAIL_SERVICE, {
  token: EMAIL_SERVICE,
  useFactory: (config: IConfig) => new SendGridEmailService(config),
  deps: [CONFIG]
});
```

### Aliases

Create aliases for existing tokens:

```typescript
nexus.set(LOGGER, { token: LOGGER, useClass: ConsoleLogger });
// Logger class is automatically aliased to LOGGER token
```

## Benefits of Dependency Injection

### 1. **Loose Coupling**
Classes depend on abstractions, not concrete implementations:

```typescript
// Before DI - tight coupling
class UserService {
  private database = new PostgresDatabase();
  private logger = new ConsoleLogger();
}

// After DI - loose coupling
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

### 2. **Testability**
Easy to mock dependencies for unit testing:

```typescript
const mockDatabase = { query: vi.fn().mockReturnValue([user]) };
const mockLogger = { log: vi.fn() };

nexus.set(DATABASE, { token: DATABASE, useValue: mockDatabase });
nexus.set(LOGGER, { token: LOGGER, useValue: mockLogger });

const userService = nexus.get(USER_SERVICE);
const result = await userService.getUser('123');

expect(mockDatabase.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = '123'");
```

### 3. **Flexibility**
Switch implementations without changing business logic:

```typescript
// Development
nexus.set(DATABASE, { useClass: InMemoryDatabase });

// Production
nexus.set(DATABASE, { useClass: PostgresDatabase });

// Testing
nexus.set(DATABASE, { token: DATABASE, useValue: mockDatabase });
```

### 4. **Maintainability**
Changes are isolated and dependencies are explicit:

```typescript
// If you need to change the database, you only change the registration
// No need to modify UserService, OrderService, ProductService, etc.
nexus.set(DATABASE, { token: DATABASE, useClass: MongoDBDatabase });
```

## Common Use Cases

### Web Applications
```typescript
// Services
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDataSource) {}
}

@Service(AUTH_SERVICE)
class AuthService implements IAuthService {
  constructor(@Inject(USER_SERVICE) private userService: IUserService) {}
}

// Controllers
@Service(USER_CONTROLLER)
class UserController {
  constructor(@Inject(USER_SERVICE) private userService: IUserService) {}
  
  async getUser(req: Request, res: Response) {
    const user = await this.userService.getUser(req.params.id);
    res.json(user);
  }
}
```

### Microservices
```typescript
// Each service has its own container
const userServiceNexus = new Nexus();
userServiceNexus.set(USER_SERVICE, { token: USER_SERVICE, useClass: UserService });

const orderServiceNexus = new Nexus();
orderServiceNexus.set(ORDER_SERVICE, { token: ORDER_SERVICE, useClass: OrderService });
```

### Libraries and Frameworks
```typescript
// Configurable library
export class MyLibrary {
  constructor(private container: Nexus) {}
  
  registerLogger(logger: ILogger) {
    this.container.set(LOGGER, { token: LOGGER, useValue: logger });
  }
  
  registerDatabase(database: IDataSource) {
    this.container.set(DATABASE, { token: DATABASE, useValue: database });
  }
}
```

## Best Practices

### 1. Use Tokens with Interfaces
```typescript
interface IUserService {
  getUser(id: string): Promise<User>;
}

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDataSource) {}
}
```