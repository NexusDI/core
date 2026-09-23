---
sidebar_position: 1
title: "API Reference"
description: "Complete API reference for NexusDI. Find detailed documentation for all classes, methods, decorators, and utilities."
tags: ["api", "reference", "documentation", "methods", "decorators"]
last_updated: "2025-01-27"
version: "1.0.0"
status: "published"
author: "NexusDI Team"
---

# 📚 API Reference

Welcome to the complete API reference for NexusDI! This is your comprehensive guide to every class, method, decorator, and utility in the NexusDI ecosystem. Think of this as your technical manual - everything you need to know about the inner workings of NexusDI.

## 🏗️ Core Classes

### Nexus (Container)

The main dependency injection container class.

```typescript
import { Nexus } from 'nexusdi-core';

const container = new Nexus();
```

**Key Features:**
- Async-first design with native TypeScript decorators
- Support for Symbol.dispose and AsyncDisposable
- Child container support
- Module system integration
- Comprehensive error handling

**Methods:**
- `init()` - Initialize the container
- `get<T>(token)` - Retrieve a service
- `set(token, provider)` - Register a service
- `setMany(providers)` - Register multiple services
- `has(token)` - Check if service is registered
- `resolve<T>(constructor)` - Resolve a class directly
- `child()` - Create a child container
- `dispose()` - Clean up resources
- `clear()` - Clear all registrations

### Token

Utility class for creating type-safe tokens.

```typescript
import { Token } from 'nexusdi-core';

const USER_SERVICE_TOKEN = Token.create<UserService>('UserService');
```

## 🎭 Decorators

### @Service

Marks a class as a service that can be injected.

```typescript
import { Service } from 'nexusdi-core';

@Service()
class UserService {
  // Service implementation
}
```

**Options:**
- `token` - Custom token for the service
- `singleton` - Whether the service should be a singleton (default: true)

### @Inject

Specifies dependencies to inject into a constructor.

```typescript
import { Inject } from 'nexusdi-core';

class UserController {
  constructor(
    @Inject() private userService: UserService,
    @Inject('customToken') private customService: CustomService
  ) {}
}
```

**Options:**
- `token` - Custom token for the dependency (optional)

### @Module

Groups related services into a module.

```typescript
import { Module } from 'nexusdi-core';

@Module({
  providers: [UserService, UserRepository],
  exports: [UserService],
  imports: [DatabaseModule]
})
class UserModule {}
```

**Options:**
- `providers` - Array of service classes
- `exports` - Array of services to export
- `imports` - Array of modules to import

### @Optional

Marks a dependency as optional.

```typescript
import { Optional } from 'nexusdi-core';

class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger
  ) {}
}
```

## 🔧 Dynamic Modules

### createModuleConfig

Creates a module configuration at runtime.

```typescript
import { createModuleConfig } from 'nexusdi-core';

const moduleConfig = createModuleConfig({
  providers: [UserService, UserRepository],
  exports: [UserService],
  imports: [DatabaseModule]
});
```

## 🛡️ Guards

Utility functions for type checking and validation.

### isTokenType

Checks if a value is a valid token type.

```typescript
import { isTokenType } from 'nexusdi-core';

if (isTokenType(token)) {
  // token is valid
}
```

### isConstructor

Checks if a value is a constructor function.

```typescript
import { isConstructor } from 'nexusdi-core';

if (isConstructor(ctor)) {
  // ctor is a constructor
}
```

### isProvider

Checks if a value is a provider configuration.

```typescript
import { isProvider } from 'nexusdi-core';

if (isProvider(provider)) {
  // provider is valid
}
```

### isModuleConfig

Checks if a value is a module configuration.

```typescript
import { isModuleConfig } from 'nexusdi-core';

if (isModuleConfig(config)) {
  // config is valid
}
```

### isPromise

Checks if a value is a Promise.

```typescript
import { isPromise } from 'nexusdi-core';

if (isPromise(value)) {
  // value is a Promise
}
```

## 🔧 Helpers

### getMetadata

Retrieves metadata from a class or instance.

```typescript
import { getMetadata } from 'nexusdi-core';

const metadata = getMetadata(UserService, 'service');
```

### setMetadata

Sets metadata on a class or instance.

```typescript
import { setMetadata } from 'nexusdi-core';

setMetadata(UserService, 'service', { token: 'userService' });
```

## 🚨 Exceptions

### ContainerException

Base exception for all container-related errors.

```typescript
import { ContainerException } from 'nexusdi-core';

throw new ContainerException('Something went wrong');
```

### InvalidToken

Thrown when an invalid token is provided.

```typescript
import { InvalidToken } from 'nexusdi-core';

throw new InvalidToken('Invalid token provided');
```

### NoProvider

Thrown when no provider is found for a token.

```typescript
import { NoProvider } from 'nexusdi-core';

throw new NoProvider('No provider found for token');
```

### InvalidProvider

Thrown when an invalid provider is provided.

```typescript
import { InvalidProvider } from 'nexusdi-core';

throw new InvalidProvider('Invalid provider configuration');
```

### InvalidModule

Thrown when an invalid module is provided.

```typescript
import { InvalidModule } from 'nexusdi-core';

throw new InvalidModule('Invalid module configuration');
```

## 📊 Types

### IContainer

Interface for the container.

```typescript
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

### TokenType

Type for all valid token types.

```typescript
type TokenType<T = any> = string | symbol | Constructor<T>;
```

### Provider

Type for all provider configurations.

```typescript
type Provider<T> = 
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ProviderConfigObject<T>;
```

### Constructor

Type for constructor functions.

```typescript
type Constructor<T = any> = new (...args: any[]) => T;
```

### Disposable

Interface for objects that can be disposed.

```typescript
interface Disposable {
  [Symbol.dispose](): void;
}
```

### AsyncDisposable

Interface for objects that can be disposed asynchronously.

```typescript
interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}
```

## 🔍 Constants

### SYMBOL_METADATA

Symbol used for metadata storage.

```typescript
import { SYMBOL_METADATA } from 'nexusdi-core';

console.log(SYMBOL_METADATA); // Symbol(metadata)
```

### METADATA_KEYS

Object containing all metadata keys.

```typescript
import { METADATA_KEYS } from 'nexusdi-core';

console.log(METADATA_KEYS.SERVICE_METADATA); // 'service'
console.log(METADATA_KEYS.INJECT_METADATA); // 'inject'
console.log(METADATA_KEYS.MODULE_METADATA); // 'module'
```

## 🚀 Usage Examples

### Basic Container Usage

```typescript
import { Nexus, Service, Inject } from 'nexusdi-core';

@Service()
class UserService {
  async getUsers() {
    return ['Luke', 'Leia', 'Han'];
  }
}

@Service()
class UserController {
  constructor(@Inject() private userService: UserService) {}
  
  async handleRequest() {
    return await this.userService.getUsers();
  }
}

// Set up container
const container = new Nexus();
await container.init();

// Register services
container.set('userService', () => new UserService());
container.set('userController', () => new UserController(container.get('userService')));

// Use services
const controller = container.get('userController');
const users = await controller.handleRequest();
```

### Module Usage

```typescript
import { Module, Service, Inject } from 'nexusdi-core';

@Service()
class DatabaseService {
  async connect() {
    console.log('Database connected');
  }
}

@Service()
class UserRepository {
  constructor(@Inject() private db: DatabaseService) {}
  
  async findUser(id: number) {
    await this.db.connect();
    return { id, name: 'Luke Skywalker' };
  }
}

@Module({
  providers: [DatabaseService, UserRepository],
  exports: [UserRepository]
})
class UserModule {}

// Register module
container.set('userModule', () => new UserModule());
```

### Dynamic Module Usage

```typescript
import { createModuleConfig } from 'nexusdi-core';

const moduleConfig = createModuleConfig({
  providers: [UserService, UserRepository],
  exports: [UserService]
});

container.set('userModule', () => moduleConfig);
```

## 🔍 Error Handling

### Common Error Scenarios

```typescript
try {
  const service = await container.get('nonExistentService');
} catch (error) {
  if (error instanceof NoProvider) {
    console.error('Service not registered');
  } else if (error instanceof InvalidToken) {
    console.error('Invalid token provided');
  } else {
    console.error('Unknown error:', error);
  }
}
```

### Container Disposal

```typescript
// Always dispose of the container when done
try {
  const container = new Nexus();
  await container.init();
  
  // Use container...
  
} finally {
  await container.dispose();
}
```

## 🎯 Next Steps

Ready to dive deeper into specific APIs?

- **[Container Methods](/docs/container/nexus-class)** - Detailed container documentation
- **[Decorators](/docs/api-reference/decorators)** - Complete decorator reference
- **[Dynamic Modules](/docs/api-reference/dynamic-module)** - Dynamic module system
- **[Guards](/docs/api-reference/guards)** - Type checking utilities

---

**Need help with a specific API?** Check out the [Container Methods](/docs/container/nexus-class) for detailed documentation on the core container functionality! 🚀
