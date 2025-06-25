---
sidebar_position: 2
---

# Getting Started 🚀

Welcome to NexusDI! This guide will help you get started with dependency injection using tokens and interfaces. We'll walk through the basics step by step.

## Why Dependency Injection?

Dependency Injection (DI) is a design pattern that helps you write more maintainable, testable, and flexible code. It provides a way to manage dependencies in your applications. Think of it as the replicator from Star Trek - you ask for what you need, and it provides exactly that, no questions asked.

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
npm install @nexusdi/core reflect-metadata
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

## Next Steps

- **[Core Concepts](./concepts.md)** - Fundamental DI concepts
- **[Dependency Injection](./dependency-injection.md)** - Detailed DI principles
- **[Tokens](./tokens.md)** - Complete guide to tokens
- **[Best Practices](./best-practices.md)** - Guidelines for maintainable code

Take it one step at a time, and you'll be building robust applications in no time! Remember, the best code is like a well-oiled machine - it just works, beratna! 🚀
