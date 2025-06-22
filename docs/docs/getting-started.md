# Getting Started

Welcome to NexusDI! This guide will help you get started with dependency injection using tokens and interfaces.

## Why Dependency Injection?

Dependency Injection (DI) is a design pattern that helps you write more maintainable, testable, and flexible code. Here's why it matters:

### The Problem: Direct Dependencies

Without DI, your classes directly instantiate their dependencies:

```typescript
// ❌ Tight coupling - hard to test and maintain
class UserService {
  private logger = new ConsoleLogger(); // Direct instantiation
  private database = new PostgresDatabase(); // Hard-coded implementation
  
  getUser(id: string) {
    this.logger.log(`Getting user ${id}`);
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}
```

**Problems with this approach:**
- **Hard to test**: You can't easily mock the logger or database
- **Tight coupling**: UserService is locked to specific implementations
- **Hard to configure**: Can't easily switch between different database types
- **Violates Single Responsibility**: Classes handle both business logic and object creation

### The Solution: Dependency Injection

With DI, dependencies are injected from the outside:

```typescript
// ✅ Loose coupling - easy to test and maintain
class UserService {
  constructor(
    private logger: Logger, // Interface/abstract dependency
    private database: Database // Interface/abstract dependency
  ) {}
  
  getUser(id: string) {
    this.logger.log(`Getting user ${id}`);
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}
```

**Benefits of this approach:**
- **Easy testing**: Inject mock implementations for isolated unit tests
- **Loose coupling**: Classes depend on abstractions, not concrete implementations
- **Flexible configuration**: Switch implementations without changing business logic
- **Single responsibility**: Classes focus only on their core functionality
- **Reusability**: Same class works with different dependency implementations

### Real-World Example

```typescript
// Without DI - hard to test and configure
class EmailService {
  private smtpClient = new SMTPClient('smtp.gmail.com', 587);
  
  sendEmail(to: string, subject: string) {
    return this.smtpClient.send({ to, subject });
  }
}

// With DI - flexible and testable
class EmailService {
  constructor(private emailProvider: EmailProvider) {}
  
  sendEmail(to: string, subject: string) {
    return this.emailProvider.send({ to, subject });
  }
}

// Easy to test
const mockProvider = { send: vi.fn() };
const emailService = new EmailService(mockProvider);
emailService.sendEmail('test@example.com', 'Hello');
expect(mockProvider.send).toHaveBeenCalledWith({
  to: 'test@example.com',
  subject: 'Hello'
});

// Easy to configure
const gmailService = new EmailService(new GmailProvider());
const sendgridService = new EmailService(new SendGridProvider());
```

## Installation

```bash
npm install @nexusdi/core
```

## Basic Usage with Tokens and Interfaces

NexusDI promotes using tokens with interfaces for better flexibility and maintainability. Here's how to get started:

### 1. Define Your Interfaces

First, define the contracts for your services:

```typescript
// interfaces/user.interface.ts
export interface IUserService {
  getUser(id: string): Promise<User>;
  createUser(user: CreateUserDto): Promise<User>;
}

export interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

export interface IDataSource {
  query(sql: string): Promise<any>;
}
```

### 2. Create Tokens

Create tokens that represent your dependencies:

```typescript
// tokens.ts
import { Token } from '@nexusdi/core';
import type { IUserService, ILogger, IDataSource } from './interfaces';

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const LOGGER = new Token<ILogger>('LOGGER');
export const DATABASE = new Token<IDataSource>('DATABASE');
```

### 3. Implement Your Services

Implement your services using the interfaces and tokens:

```typescript
// services/user.service.ts
import { Service, Inject } from '@nexusdi/core';
import { USER_SERVICE, DATABASE, LOGGER } from '../tokens';
import type { IUserService, IDataSource, ILogger } from '../interfaces';

@Service(USER_SERVICE)
export class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async getUser(id: string): Promise<User> {
    this.logger.log(`Fetching user with id: ${id}`);
    const result = await this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
    return result[0];
  }

  async createUser(userData: CreateUserDto): Promise<User> {
    this.logger.log(`Creating new user: ${userData.name}`);
    const result = await this.database.query(
      `INSERT INTO users (name, email) VALUES ('${userData.name}', '${userData.email}') RETURNING *`
    );
    return result[0];
  }
}
```

### 4. Create Your Container

Set up your Nexus container and register your dependencies:

```typescript
// app.ts
import { Nexus } from '@nexusdi/core';
import { USER_SERVICE, LOGGER, DATABASE } from './tokens';
import { UserService } from './services/user.service';
import { ConsoleLogger } from './services/console-logger.service';
import { PostgresDatabase } from './services/postgres-database.service';

// Create the container
const nexus = new Nexus();

// Register your services
nexus.set(USER_SERVICE, { useClass: UserService });
nexus.set(LOGGER, { useClass: ConsoleLogger });
nexus.set(DATABASE, { useClass: PostgresDatabase });

// Use your services
const userService = nexus.get(USER_SERVICE);
const user = await userService.getUser('123');
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
// Test setup
const mockDatabase = {
  query: vi.fn().mockReturnValue([{ id: '123', name: 'John' }])
};

const mockLogger = {
  log: vi.fn(),
  error: vi.fn()
};

nexus.set(DATABASE, { token: DATABASE, useValue: mockDatabase });
nexus.set(LOGGER, { token: LOGGER, useValue: mockLogger });

const userService = nexus.get(USER_SERVICE);
const user = await userService.getUser('123');

expect(mockDatabase.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = '123'");
```

### 3. **Flexible Configuration**
Switch implementations without changing your business logic:

```typescript
// Development
nexus.set(DATABASE, { token: DATABASE, useClass: InMemoryDatabase });
nexus.set(LOGGER, { token: LOGGER, useClass: ConsoleLogger });

// Production
nexus.set(DATABASE, { token: DATABASE, useClass: PostgresDatabase });
nexus.set(LOGGER, { token: LOGGER, useClass: FileLogger });

// Same UserService works with both configurations
const userService = nexus.get(USER_SERVICE);
```

## Advanced Usage

### Using Modules

Organize related services into modules:

```typescript
// modules/user.module.ts
import { Module } from '@nexusdi/core';
import { USER_SERVICE, DATABASE, LOGGER } from '../tokens';
import { UserService } from '../services/user.service';
import { PostgresDatabase } from '../services/postgres-database.service';
import { ConsoleLogger } from '../services/console-logger.service';

@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase },
    { token: LOGGER, useClass: ConsoleLogger }
  ]
})
export class UserModule {}
```

### Property Injection

Inject dependencies into properties:

```typescript
@Service(USER_SERVICE)
export class UserService implements IUserService {
  @Inject(DATABASE)
  private database!: IDataSource;
  
  @Inject(LOGGER)
  private logger!: ILogger;

  async getUser(id: string): Promise<User> {
    this.logger.log(`Fetching user: ${id}`);
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}
```

### Factory Providers

Create complex objects with factory functions:

```typescript
nexus.set(DATABASE, {
  token: DATABASE,
  useFactory: () => {
    const config = loadDatabaseConfig();
    return new PostgresDatabase(config);
  }
});
```

### Value Providers

Register simple values or existing instances:

```typescript
nexus.set(API_KEY, { token: API_KEY, useValue: process.env.API_KEY });
nexus.set(LOGGER, { token: LOGGER, useValue: winston.createLogger() });
```

## Type Safety

NexusDI provides full TypeScript support with generics:

```typescript
// Tokens are type-safe
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

// Getting services is type-safe
const userService = nexus.get(USER_SERVICE); // Type: IUserService

// Injection is type-safe
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDataSource) {} // Type: IDataSource
}
```

## Next Steps

- Read the [Concepts](./concepts.md) guide to understand DI principles
- Check out [Advanced Usage](./advanced.md) for more complex scenarios
- Explore the [FAQ](./faq.md) for common questions
- Look at the [examples](../examples/) for complete working examples

Happy coding with NexusDI! 🚀 