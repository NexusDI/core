---
sidebar_position: 2
---

# Getting Started 🚀

This guide will help you get started with dependency injection using tokens and interfaces. We'll walk through the basics step by step—no need to reroute power from life support, just follow along!

## Why Dependency Injection?

Dependency Injection (DI) is a design pattern that helps you write more maintainable, testable, and flexible code. It provides a way to manage dependencies in your applications by letting you supply the building blocks your code needs, rather than having each part create its own. This makes your code easier to test, extend, and maintain.

For a comprehensive explanation of DI principles and benefits, see **[Dependency Injection](./dependency-injection.md)**.

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

For detailed explanations and real-world examples, see **[Dependency Injection](./dependency-injection.md)** and **[DI vs Regular Imports](./di-vs-imports.md)**.

## Installation

```bash
npm install @nexusdi/core
```

## TypeScript Configuration

To use decorators and metadata with NexusDI, make sure your `tsconfig.json` includes the following settings (set your phasers to es2022!):

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022", "esnext.decorators"],
    "experimentalDecorators": true,
    "useDefineForClassFields": true // Defaults to 'true' in TypeScript 5.2+
  }
}
```

> 🛠️ **Tip:** These settings ensure that TypeScript emits the correct decorator and metadata code for NexusDI. If you see errors about decorators or metadata, double-check your `tsconfig.json`.

> **Note:** NexusDI v0.3.0+ uses native decorator metadata (TypeScript 5.2+). You do not need to install or import `reflect-metadata`.

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

For a complete guide to tokens, see **[Tokens](./tokens.md)**.

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
    const result = await this.database.query(
      `SELECT * FROM users WHERE id = '${id}'`
    );
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

### 4. Create Your Nexus Container

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

For a detailed explanation of why tokens and interfaces are better than direct class references, see **[Dependency Injection](./dependency-injection.md)**.

## Testing Your Setup 🧪

Want to make sure everything is working—and get comfortable with testing early? Here's a unit test using the NexusDI container, inspired by real-world NexusDI projects (with [Vitest](https://vitest.dev/), but you can use Jest or your favorite runner). This example uses the most common and compatible pattern for unit tests today:

```typescript
// user.service.test.ts
// Example: Unit test for UserService using NexusDI container and interface-matching mocks
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Nexus } from '@nexusdi/core';
import { USER_SERVICE, LOGGER, DATABASE } from './tokens';
import { UserService } from './services/user.service';
import type { IUserService, ILogger, IDataSource } from './interfaces';

describe('UserService (with DI container)', () => {
  let container: Nexus;
  let mockLogger: ILogger;
  let mockDatabase: IDataSource;

  beforeEach(() => {
    container = new Nexus();
    mockLogger = { log: vi.fn(), error: vi.fn() };
    mockDatabase = {
      query: vi.fn().mockResolvedValue([{ id: '42', name: 'Test User' }]),
    };
    container.set(LOGGER, { useValue: mockLogger });
    container.set(DATABASE, { useValue: mockDatabase });
    container.set(USER_SERVICE, { useClass: UserService });
  });

  afterEach(() => {
    container.clear();
  });

  it('returns a user by id', async () => {
    const userService = container.get<IUserService>(USER_SERVICE);
    const user = await userService.getUser('42');
    expect(user).toEqual({ id: '42', name: 'Test User' });
    expect(mockLogger.log).toHaveBeenCalledWith('Fetching user with id: 42');
    expect(mockDatabase.query).toHaveBeenCalled();
  });
});
```

> 🧑‍🔬 **Tip:** This pattern is familiar to most developers and works with all major test runners. You can always migrate to the disposal protocol (`using`/`Symbol.dispose`) as it becomes more widely adopted.

If you see output and no errors, you're ready to explore the galaxy of DI!

## Next Steps

- **[Core Concepts](./concepts.md)** - Fundamental DI concepts
- **[Dependency Injection](./dependency-injection.md)** - Detailed DI principles
- **[Tokens](./tokens.md)** - Complete guide to tokens
- **[Best Practices](./best-practices.md)** - Guidelines for maintainable code

Take it one step at a time, and you'll be building robust applications in no time! Remember, the best code is like a well-oiled machine - it just works, beratna! 🚀
