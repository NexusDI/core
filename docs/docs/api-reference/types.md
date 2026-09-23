---
sidebar_position: 6
title: 'Types'
description: 'Complete reference for all NexusDI TypeScript types and interfaces. Learn about the type system and how to use it effectively.'
tags: ['types', 'api', 'reference', 'typescript', 'interfaces']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 📝 Types

Welcome to the complete type reference for NexusDI! This is your comprehensive guide to all the TypeScript types and interfaces that make NexusDI type-safe and powerful. Think of these types as the blueprints of a starship - they define the structure and ensure everything fits together perfectly.

## 🏗️ Core Types

### `IContainer`

The main interface for the dependency injection container.

```tsx
interface IContainer {
  init(): Promise<void>;
  get<T>(token: TokenType<T>): Promise<T>;
  set<T>(token: TokenType<T>, provider: Provider<T>): void;
  setMany(providers: Record<string, Provider<any>>): void;
  has(token: TokenType<unknown>): boolean;
  resolve<T>(ctor: Constructor<T>): Promise<T>;
  child(): IContainer;
  dispose(): Promise<void>;
  clear(): Promise<void>;
}
```

**Example:**

```tsx
import { IContainer } from 'nexusdi-core';

class MyService {
  constructor(private container: IContainer) {}

  async doSomething() {
    const userService = await this.container.get('userService');
    return await userService.getUsers();
  }
}
```

### `TokenType<T>`

Type for all valid token types that can be used to identify services.

```tsx
type TokenType<T = any> = string | symbol | Constructor<T>;
```

**Example:**

```tsx
// String token
const stringToken: TokenType<UserService> = 'userService';

// Symbol token
const symbolToken: TokenType<UserService> = Symbol('userService');

// Class token
const classToken: TokenType<UserService> = UserService;

// Token instance
const tokenInstance: TokenType<UserService> = new Token('userService');
```

### `Constructor<T>`

Type for constructor functions.

```tsx
type Constructor<T = any> = new (...args: any[]) => T;
```

**Example:**

```tsx
class UserService {
  constructor(private db: DatabaseService) {}
}

// UserService is a Constructor<UserService>
const ctor: Constructor<UserService> = UserService;
```

## 📦 Provider Types

### `Provider<T>`

Union type for all provider configurations.

```tsx
type Provider<T> =
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ProviderConfigObject<T>;
```

**Example:**

```tsx
// Class provider
const classProvider: Provider<UserService> = {
  useClass: UserService,
};

// Value provider
const valueProvider: Provider<string> = {
  useValue: 'some value',
};

// Factory provider
const factoryProvider: Provider<UserService> = {
  useFactory: container => new UserService(container.get('database')),
};
```

### `ClassProvider<T>`

Provider configuration for class-based services.

```tsx
interface ClassProvider<T> {
  useClass: Constructor<T>;
}
```

**Example:**

```tsx
const userServiceProvider: ClassProvider<UserService> = {
  useClass: UserService,
};
```

### `ValueProvider<T>`

Provider configuration for value-based services.

```tsx
interface ValueProvider<T> {
  useValue: T;
}
```

**Example:**

```tsx
const configProvider: ValueProvider<AppConfig> = {
  useValue: {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
  },
};
```

### `FactoryProvider<T>`

Provider configuration for factory-based services.

```tsx
interface FactoryProvider<T> {
  useFactory: (container: IContainer) => T | Promise<T>;
}
```

**Example:**

```tsx
const userServiceProvider: FactoryProvider<UserService> = {
  useFactory: container => {
    const db = container.get('database');
    return new UserService(db);
  },
};
```

### `ProviderConfigObject<T>`

Extended provider configuration with additional options.

```tsx
interface ProviderConfigObject<T> {
  useClass?: Constructor<T>;
  useValue?: T;
  useFactory?: (container: IContainer) => T | Promise<T>;
  eager?: boolean;
  disposed?: boolean;
}
```

**Example:**

```tsx
const userServiceProvider: ProviderConfigObject<UserService> = {
  useClass: UserService,
  eager: true, // Initialize immediately
  disposed: false,
};
```

## 🏷️ Token Types

### `Token<T>`

Class for creating type-safe tokens.

```tsx
class Token<T = any> {
  constructor(public name: string) {}

  toString(): string {
    return `Token(${this.name})`;
  }
}
```

**Example:**

```tsx
import { Token } from 'nexusdi-core';

const USER_SERVICE_TOKEN = new Token<UserService>('UserService');
const DATABASE_TOKEN = new Token<DatabaseService>('DatabaseService');

// Use with container
container.set(USER_SERVICE_TOKEN, () => new UserService());
const userService = await container.get(USER_SERVICE_TOKEN);
```

## 📋 Module Types

### `ModuleConfig`

Configuration object for modules.

```tsx
interface ModuleConfig {
  providers?: (Constructor | ProviderConfigObject)[];
  exports?: (Constructor | TokenType)[];
  imports?: (Constructor | ModuleConfig)[];
}
```

**Example:**

```tsx
const userModuleConfig: ModuleConfig = {
  providers: [UserService, UserRepository],
  exports: [UserService],
  imports: [DatabaseModule],
};
```

### `ModuleProvider`

Provider configuration for modules.

```tsx
type ModuleProvider = Constructor | ModuleConfig;
```

**Example:**

```tsx
const moduleProvider: ModuleProvider = UserModule;
// or
const moduleProvider: ModuleProvider = {
  providers: [UserService],
  exports: [UserService],
};
```

## 🔧 Registration Types

### `RegistrationOptions`

Options for service registration.

```tsx
interface RegistrationOptions {
  eager?: boolean;
  disposed?: boolean;
}
```

**Example:**

```tsx
container.set('userService', () => new UserService(), {
  eager: true, // Initialize immediately
  disposed: false,
});
```

## 🧹 Disposal Types

### `Disposable`

Interface for objects that can be disposed synchronously.

```tsx
interface Disposable {
  [Symbol.dispose](): void;
}
```

**Example:**

```tsx
class DatabaseConnection implements Disposable {
  private connection: Connection;

  async connect() {
    this.connection = await Database.connect();
  }

  [Symbol.dispose]() {
    if (this.connection) {
      this.connection.close();
    }
  }
}
```

### `AsyncDisposable`

Interface for objects that can be disposed asynchronously.

```tsx
interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}
```

**Example:**

```tsx
class DatabaseService implements AsyncDisposable {
  private connection: Connection;

  async connect() {
    this.connection = await Database.connect();
  }

  async [Symbol.asyncDispose]() {
    if (this.connection) {
      await this.connection.close();
    }
  }
}
```

## 🎭 Metadata Types

### `InjectionMetadata`

Metadata for dependency injection.

```tsx
interface InjectionMetadata {
  token?: TokenType;
  optional?: boolean;
}
```

**Example:**

```tsx
// This is used internally by decorators
const metadata: InjectionMetadata = {
  token: 'userService',
  optional: false,
};
```

## 🔍 Guard Types

### `TokenType<T>`

Type for all valid token types.

```tsx
type TokenType<T = any> = string | symbol | Constructor<T>;
```

### `Constructor<T>`

Type for constructor functions.

```tsx
type Constructor<T = any> = new (...args: any[]) => T;
```

### `Provider<T>`

Type for all provider configurations.

```tsx
type Provider<T> =
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ProviderConfigObject<T>;
```

## 🎯 Real-World Examples

### Service Interface

```tsx
interface IUserService {
  getUser(id: number): Promise<User>;
  createUser(userData: UserData): Promise<User>;
  updateUser(id: number, userData: Partial<UserData>): Promise<User>;
  deleteUser(id: number): Promise<void>;
}

@Service()
class UserService implements IUserService {
  constructor(
    @Inject() private userRepo: IUserRepository,
    @Inject() private logger: ILogger
  ) {}

  async getUser(id: number): Promise<User> {
    this.logger.info('Getting user', { id });
    return await this.userRepo.findById(id);
  }

  async createUser(userData: UserData): Promise<User> {
    this.logger.info('Creating user', { userData });
    return await this.userRepo.save(userData);
  }

  async updateUser(id: number, userData: Partial<UserData>): Promise<User> {
    this.logger.info('Updating user', { id, userData });
    return await this.userRepo.update(id, userData);
  }

  async deleteUser(id: number): Promise<void> {
    this.logger.info('Deleting user', { id });
    await this.userRepo.delete(id);
  }
}
```

### Module Configuration

```tsx
const userModuleConfig: ModuleConfig = {
  providers: [
    UserService,
    UserRepository,
    {
      token: 'userConfig',
      useValue: {
        maxUsers: 1000,
        enableCaching: true,
      },
    },
  ],
  exports: [UserService],
  imports: [DatabaseModule, LoggerModule],
};
```

### Dynamic Module

```tsx
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  ssl: boolean;
}

const DATABASE_CONFIG_TOKEN = new Token<DatabaseConfig>('DatabaseConfig');

@Module({})
class DatabaseModule implements DynamicModule<DatabaseConfig> {
  configToken = DATABASE_CONFIG_TOKEN;

  static async config(config: DatabaseConfig | Promise<DatabaseConfig>) {
    return await createModuleConfig(new this(), config);
  }
}
```

### Error Handling

```tsx
import {
  ContainerException,
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
} from 'nexusdi-core';

async function safeGetService<T>(token: TokenType<T>): Promise<T | null> {
  try {
    return await container.get(token);
  } catch (error) {
    if (error instanceof NoProvider) {
      console.error('Service not registered:', token);
    } else if (error instanceof InvalidToken) {
      console.error('Invalid token:', token);
    } else if (error instanceof ContainerException) {
      console.error('Container error:', error.message);
    } else {
      console.error('Unknown error:', error);
    }
    return null;
  }
}
```

## 🔧 Best Practices

### 1. Use Specific Types

```tsx
// ✅ Good - Specific types
interface IUserService {
  getUser(id: number): Promise<User>;
}

@Service()
class UserService implements IUserService {
  async getUser(id: number): Promise<User> {
    // Implementation
  }
}

// ❌ Bad - Generic types
@Service()
class UserService {
  async getUser(id: any): Promise<any> {
    // Implementation
  }
}
```

### 2. Use Interface Segregation

```tsx
// ✅ Good - Focused interfaces
interface IUserReader {
  getUser(id: number): Promise<User>;
  getUsers(): Promise<User[]>;
}

interface IUserWriter {
  createUser(userData: UserData): Promise<User>;
  updateUser(id: number, userData: Partial<UserData>): Promise<User>;
  deleteUser(id: number): Promise<void>;
}

// ❌ Bad - Fat interface
interface IUserService {
  getUser(id: number): Promise<User>;
  getUsers(): Promise<User[]>;
  createUser(userData: UserData): Promise<User>;
  updateUser(id: number, userData: Partial<UserData>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  sendEmail(to: string, subject: string): Promise<void>;
  processPayment(amount: number): Promise<void>;
}
```

### 3. Use Generic Types for Reusability

```tsx
// ✅ Good - Generic repository
interface IRepository<T> {
  findById(id: number): Promise<T>;
  save(entity: T): Promise<T>;
  update(id: number, entity: Partial<T>): Promise<T>;
  delete(id: number): Promise<void>;
}

@Service()
class UserRepository implements IRepository<User> {
  async findById(id: number): Promise<User> {
    // Implementation
  }

  async save(user: User): Promise<User> {
    // Implementation
  }

  async update(id: number, user: Partial<User>): Promise<User> {
    // Implementation
  }

  async delete(id: number): Promise<void> {
    // Implementation
  }
}
```

### 4. Use Union Types for Flexibility

```tsx
// ✅ Good - Union types for flexibility
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ILogger {
  log(level: LogLevel, message: string, data?: any): void;
}

// ❌ Bad - String type
interface ILogger {
  log(level: string, message: string, data?: any): void;
}
```

## 🔍 Troubleshooting

### Common Type Issues

**Type not found:**

```tsx
// Make sure to import the type
import { IContainer, TokenType, Provider } from 'nexusdi-core';
```

**Generic type errors:**

```tsx
// Use proper generic constraints
interface IRepository<T extends { id: number }> {
  findById(id: number): Promise<T>;
}
```

**Union type errors:**

```tsx
// Use type guards for union types
function isUserService(service: any): service is IUserService {
  return service && typeof service.getUser === 'function';
}
```

## 🎯 Next Steps

Ready to explore more type features?

- **[Container Methods](/docs/api-reference/container)** - Learn about container operations
- **[Decorators](/docs/api-reference/decorators)** - Master service decorators
- **[Dynamic Modules](/docs/api-reference/dynamic-module)** - Use types with dynamic modules
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with types?** Check out the [Container Methods](/docs/api-reference/container) reference for how to use types with the container! 🚀
