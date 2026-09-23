---
sidebar_position: 1
title: 'Core Concepts'
description: 'Understand the fundamental concepts behind NexusDI and dependency injection. Learn how the container works and why it makes your code more maintainable.'
tags: ['concepts', 'dependency-injection', 'container', 'architecture']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🎯 Core Concepts

Welcome to the heart of NexusDI! Understanding these core concepts will help you wield the power of dependency injection like a Jedi master. Think of these concepts as the building blocks of a well-architected application - each one plays a crucial role in creating maintainable, testable code.

## 🏗️ What is Dependency Injection?

Dependency Injection (DI) is a design pattern where objects receive their dependencies from an external source rather than creating them internally. It's like having a personal assistant who knows exactly what you need and delivers it right when you need it.

### Without Dependency Injection

```tsx
class UserService {
  private database: Database;
  private emailService: EmailService;

  constructor() {
    // Creating dependencies internally - tightly coupled!
    this.database = new Database();
    this.emailService = new EmailService();
  }

  async createUser(userData: UserData) {
    const user = await this.database.save(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

**Problems with this approach:**

- Hard to test (can't mock dependencies)
- Tightly coupled to specific implementations
- Difficult to change database or email service
- Violates the Single Responsibility Principle

### With Dependency Injection

```tsx
class UserService {
  constructor(private database: Database, private emailService: EmailService) {}

  async createUser(userData: UserData) {
    const user = await this.database.save(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

**Benefits of this approach:**

- Easy to test (inject mock dependencies)
- Loosely coupled to abstractions
- Easy to swap implementations
- Follows SOLID principles

## 🏺 The Container

The container is the central orchestrator in NexusDI. It's like the control room of a spaceship - it knows about all your services and how to wire them together.

```text
import { Nexus, Service, Inject, Token } from 'nexusdi-core';

@Service()
class DatabaseService {}

@Service()
class EmailService {}

@Service()
class UserService {
  constructor(
    @Inject(DatabaseService) private database: DatabaseService,
    @Inject(EmailService) private emailService: EmailService
  ) {}
}

const container = new Nexus();
await container.init();

// Register services using uninstantiated classes
await container.set(DatabaseService);
await container.set(EmailService);
await container.set(UserService);

// Use services
const userService = await container.get(UserService);
```

### Container Responsibilities

1. **Service Registration** - Know what services are available
2. **Dependency Resolution** - Figure out how to create services
3. **Lifecycle Management** - Handle service creation and disposal
4. **Scope Management** - Control when services are created and destroyed

## 🏷️ Tokens and Registration

Tokens are unique identifiers for your services. Think of them as addresses in a galactic directory - each service has its own unique address.

```text
// Class tokens (type-safe and recommended)
await container.set(UserService);

// Custom tokens with Token class
const USER_SERVICE_TOKEN = new Token<UserService>('UserService');
await container.set(USER_SERVICE_TOKEN, UserService);

// Symbol tokens
const USER_SERVICE_SYMBOL = Symbol('UserService');
await container.set(USER_SERVICE_SYMBOL, UserService);
```

### Registration Types

NexusDI supports several registration patterns:

```text
// 1. Class Registration (uninstantiated)
await container.set(UserService);

// 2. Value Registration with Token
const API_KEY_TOKEN = new Token<string>('ApiKey');
await container.set(API_KEY_TOKEN, { useValue: 'your-api-key-here' });

// 3. Factory Registration
const USER_SERVICE_TOKEN = new Token<UserService>('UserService');
await container.set(USER_SERVICE_TOKEN, {
  useFactory: async (container) => {
    const db = await container.get(DatabaseService);
    const email = await container.get(EmailService);
    return new UserService(db, email);
  },
  deps: [DatabaseService, EmailService]
});

// 4. Value Registration
const CONFIG_TOKEN = new Token<Config>('Config');
await container.set(CONFIG_TOKEN, { useValue: { apiUrl: 'https://api.example.com' } });
```

## 🎭 Decorators

Decorators are the magic that makes dependency injection feel natural in TypeScript. They're like the Force - they work behind the scenes to make everything come together.

### @Service Decorator

Marks a class as a service that can be injected:

```tsx
import { Service } from 'nexusdi-core';

@Service()
class UserService {
  // This class can now be injected
}
```

### @Inject Decorator

Specifies which dependencies to inject:

```text
import { Service, Inject } from 'nexusdi-core';

@Service()
class UserController {
  constructor(
    @Inject(UserService) private userService: UserService,
    @Inject(EmailService) private emailService: EmailService
  ) {}
}
```

### @Module Decorator

Groups related services together:

```tsx
import { Module, Service } from 'nexusdi-core';

@Service()
class DatabaseService {}

@Service()
class UserRepository {}

@Module({
  providers: [DatabaseService, UserRepository],
})
class UserModule {}
```

## 🔄 Service Lifecycle

Understanding service lifecycle is crucial for building robust applications. Services in NexusDI follow a predictable lifecycle:

### 1. Registration Phase

```text
// Services are registered but not yet created
await container.set(UserService);
```

### 2. Resolution Phase

```text
// Services are created when first requested
const userService = await container.get(UserService);
```

### 3. Usage Phase

```text
// Services are used throughout the application
const users = await userService.getAllUsers();
```

### 4. Disposal Phase

```text
// Services are cleaned up when the container is disposed
await container.dispose();
```

## 🏗️ Modules

Modules are a way to organize related services into logical groups. Think of them as different departments in a large organization - each department has its own responsibilities and services.

```tsx
import { Module, Service } from 'nexusdi-core';

// Database module
@Module({
  providers: [DatabaseService, ConnectionPool],
})
class DatabaseModule {}

// User module
@Module({
  providers: [UserService, UserRepository, UserController],
})
class UserModule {}

// Email module
@Module({
  providers: [EmailService, SMTPConfig, TemplateEngine],
})
class EmailModule {}
```

### Module Benefits

- **Organization** - Group related services together
- **Reusability** - Modules can be reused across applications
- **Testing** - Test modules in isolation
- **Configuration** - Configure modules independently

## 🔧 Dynamic Modules

Sometimes you need to configure modules at runtime. Dynamic modules give you the flexibility to create modules programmatically:

```text
import { createModuleConfig } from 'nexusdi-core';

const userModuleConfig = createModuleConfig({
  providers: [UserService, UserRepository],
  imports: [DatabaseModule],
  exports: [UserService],
});

await container.set(userModuleConfig);
```

## 🎯 Best Practices

### 1. Use Interfaces for Dependencies

```text
interface IUserRepository {
  findById(id: number): Promise<User>;
  save(user: User): Promise<void>;
}

const USER_REPOSITORY_TOKEN = new Token<IUserRepository>('UserRepository');

@Service()
class UserService {
  constructor(@Inject(USER_REPOSITORY_TOKEN) private userRepo: IUserRepository) {}
}
```

### 2. Keep Services Focused

```text
// Good - single responsibility
@Service()
class UserService {
  async findUser(id: number) {
    // Only user-related logic
  }
}

// Bad - multiple responsibilities
@Service()
class UserService {
  async findUser(id: number) {
    // User logic
  }

  async sendEmail(to: string, subject: string) {
    // Email logic - should be in EmailService
  }
}
```

### 3. Use Dependency Injection for All Dependencies

```text
// Good - all dependencies injected
const USER_REPO_TOKEN = new Token<IUserRepository>('UserRepository');
const EMAIL_SERVICE_TOKEN = new Token<IEmailService>('EmailService');
const LOGGER_TOKEN = new Token<ILogger>('Logger');

@Service()
class UserService {
  constructor(
    @Inject(USER_REPO_TOKEN) private userRepo: IUserRepository,
    @Inject(EMAIL_SERVICE_TOKEN) private emailService: IEmailService,
    @Inject(LOGGER_TOKEN) private logger: ILogger
  ) {}
}

// Bad - mixing injection with direct instantiation
@Service()
class UserService {
  constructor(@Inject(USER_REPO_TOKEN) private userRepo: IUserRepository) {
    this.logger = new Logger(); // Should be injected
  }
}
```

## 🚀 Next Steps

Now that you understand the core concepts, you're ready to explore:

- **[Container API](/docs/container/nexus-class)** - Deep dive into the container
- **[Modules](/docs/modules/module-basics)** - Learn about module organization
- **[Advanced Patterns](/docs/advanced)** - Discover advanced usage patterns
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Ready to build something amazing?** Let's explore the [Container API](/docs/container/nexus-class) to see how these concepts work in practice! 🚀
