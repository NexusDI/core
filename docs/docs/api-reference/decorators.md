---
sidebar_position: 3
title: 'Decorators'
description: 'Complete reference for all NexusDI decorators. Learn how to use @Service, @Inject, @Module, and @Optional decorators effectively.'
tags: ['decorators', 'api', 'reference', 'service', 'inject', 'module']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🎭 Decorators

Decorators are the magic that makes dependency injection feel natural in TypeScript. They're like the Force - they work behind the scenes to make everything come together seamlessly. This reference covers all the decorators available in NexusDI.

## 🏷️ @Service

Marks a class as a service that can be injected into other services.

### Basic Usage

```tsx
import { Service } from 'nexusdi-core';

@Service()
class UserService {
  async getUsers() {
    return ['Luke', 'Leia', 'Han'];
  }
}
```

### With Custom Token

```tsx
@Service('customUserService')
class UserService {
  async getUsers() {
    return ['Luke', 'Leia', 'Han'];
  }
}
```

### With Options

```tsx
@Service({
  token: 'userService',
  singleton: true,
})
class UserService {
  async getUsers() {
    return ['Luke', 'Leia', 'Han'];
  }
}
```

**Options:**

- `token` - Custom token for the service (optional)
- `singleton` - Whether the service should be a singleton (default: true)

**Example:**

```tsx
@Service()
class DatabaseService {
  private connection: DatabaseConnection;

  async connect() {
    this.connection = await Database.connect();
  }

  async query(sql: string) {
    return await this.connection.query(sql);
  }
}

@Service()
class UserRepository {
  constructor(@Inject() private db: DatabaseService) {}

  async findUser(id: number) {
    const result = await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    return result[0];
  }
}
```

## 💉 @Inject

Specifies which dependencies to inject into a constructor.

### Basic Usage

```tsx
import { Inject } from 'nexusdi-core';

class UserController {
  constructor(@Inject() private userService: UserService) {}
}
```

### With Custom Token

```tsx
class UserController {
  constructor(
    @Inject() private userService: UserService,
    @Inject('customEmailService') private emailService: EmailService
  ) {}
}
```

### Multiple Dependencies

```tsx
class UserController {
  constructor(
    @Inject() private userService: UserService,
    @Inject() private emailService: EmailService,
    @Inject() private logger: Logger
  ) {}
}
```

**Example:**

```tsx
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private emailService: EmailService,
    @Inject() private logger: Logger
  ) {}

  async createUser(userData: UserData) {
    this.logger.info('Creating user', { userData });

    const user = await this.userRepo.save(userData);
    await this.emailService.sendWelcomeEmail(user.email);

    this.logger.info('User created successfully', { userId: user.id });
    return user;
  }
}
```

## 📦 @Module

Groups related services into a module for better organization.

### Basic Usage

```tsx
import { Module } from 'nexusdi-core';

@Module({
  providers: [UserService, UserRepository, UserController],
})
class UserModule {}
```

### With Exports

```tsx
@Module({
  providers: [UserService, UserRepository, DatabaseService],
  exports: [UserService], // Only UserService is available to other modules
})
class UserModule {}
```

### With Imports

```tsx
@Module({
  providers: [UserService, UserRepository],
  imports: [DatabaseModule], // Import other modules
  exports: [UserService],
})
class UserModule {}
```

**Options:**

- `providers` - Array of service classes
- `exports` - Array of services to export to other modules
- `imports` - Array of modules to import

**Example:**

```tsx
// Database Module
@Module({
  providers: [DatabaseService, ConnectionPool],
  exports: [DatabaseService],
})
class DatabaseModule {}

// User Module
@Module({
  providers: [UserService, UserRepository, UserController],
  imports: [DatabaseModule], // Import database module
  exports: [UserService], // Export user service
})
class UserModule {}

// Order Module
@Module({
  providers: [OrderService, OrderRepository, OrderController],
  imports: [DatabaseModule, UserModule], // Import both modules
  exports: [OrderService],
})
class OrderModule {}
```

## 🔧 @Optional

Marks a dependency as optional, allowing it to be undefined.

### Basic Usage

```tsx
import { Optional } from 'nexusdi-core';

class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger
  ) {}
}
```

### With Custom Token

```tsx
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject('customLogger') private logger?: Logger
  ) {}
}
```

### Multiple Optional Dependencies

```tsx
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger,
    @Optional() @Inject() private cache?: CacheService,
    @Optional() @Inject() private metrics?: MetricsService
  ) {}
}
```

**Example:**

```tsx
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger,
    @Optional() @Inject() private cache?: CacheService
  ) {}

  async getUser(id: number) {
    // Check if cache is available
    if (this.cache) {
      const cached = await this.cache.get(`user:${id}`);
      if (cached) {
        this.logger?.info('User found in cache', { id });
        return cached;
      }
    }

    // Get from repository
    const user = await this.userRepo.findById(id);

    // Log if logger is available
    this.logger?.info('User retrieved from database', { id, userId: user.id });

    // Cache if cache is available
    if (this.cache) {
      await this.cache.set(`user:${id}`, user);
    }

    return user;
  }
}
```

## 🎯 Real-World Examples

### Complete Service with All Decorators

```tsx
import { Service, Inject, Optional } from 'nexusdi-core';

@Service()
class DatabaseService {
  async connect() {
    console.log('Database connected');
  }

  async query(sql: string) {
    // Simulate database query
    return [];
  }
}

@Service()
class Logger {
  info(message: string, data?: any) {
    console.log(`[INFO] ${message}`, data);
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error);
  }
}

@Service()
class CacheService {
  private cache = new Map<string, any>();

  async get(key: string) {
    return this.cache.get(key);
  }

  async set(key: string, value: any) {
    this.cache.set(key, value);
  }
}

@Service()
class UserRepository {
  constructor(
    @Inject() private db: DatabaseService,
    @Optional() @Inject() private logger?: Logger
  ) {}

  async findById(id: number) {
    this.logger?.info('Finding user by ID', { id });

    const result = await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    const user = result[0];

    this.logger?.info('User found', { id, userId: user?.id });
    return user;
  }
}

@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger,
    @Optional() @Inject() private cache?: CacheService
  ) {}

  async getUser(id: number) {
    // Try cache first
    if (this.cache) {
      const cached = await this.cache.get(`user:${id}`);
      if (cached) {
        this.logger?.info('User found in cache', { id });
        return cached;
      }
    }

    // Get from repository
    const user = await this.userRepo.findById(id);

    if (!user) {
      this.logger?.error('User not found', { id });
      throw new Error('User not found');
    }

    // Cache the result
    if (this.cache) {
      await this.cache.set(`user:${id}`, user);
    }

    this.logger?.info('User retrieved successfully', { id, userId: user.id });
    return user;
  }
}

// Module definition
@Module({
  providers: [
    DatabaseService,
    Logger,
    CacheService,
    UserRepository,
    UserService,
  ],
  exports: [UserService],
})
class UserModule {}
```

## 🔍 Best Practices

### 1. Use @Service for All Injectable Classes

```tsx
// ✅ Good - All services are marked
@Service()
class UserService {}

@Service()
class UserRepository {}

@Service()
class UserController {}

// ❌ Bad - Missing @Service decorator
class UserService {} // Won't be injectable
```

### 2. Use @Inject for All Dependencies

```tsx
// ✅ Good - All dependencies are injected
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private emailService: EmailService
  ) {}
}

// ❌ Bad - Manual instantiation
@Service()
class UserService {
  constructor() {
    this.userRepo = new UserRepository(); // Don't do this
  }
}
```

### 3. Use @Optional for Optional Dependencies

```tsx
// ✅ Good - Optional dependencies are marked
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger
  ) {}
}

// ❌ Bad - Required optional dependency
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private logger: Logger // Will fail if logger not registered
  ) {}
}
```

### 4. Organize Services in Modules

```tsx
// ✅ Good - Services organized in modules
@Module({
  providers: [UserService, UserRepository, UserController],
  exports: [UserService],
})
class UserModule {}

// ❌ Bad - Services not organized
// All services registered individually
container.set('userService', () => new UserService());
container.set('userRepository', () => new UserRepository());
container.set('userController', () => new UserController());
```

## 🚀 Advanced Usage

### Custom Tokens

```tsx
// Define custom tokens
const USER_SERVICE_TOKEN = Symbol('UserService');
const EMAIL_SERVICE_TOKEN = Symbol('EmailService');

// Use with decorators
@Service(USER_SERVICE_TOKEN)
class UserService {}

class UserController {
  constructor(
    @Inject(USER_SERVICE_TOKEN) private userService: UserService,
    @Inject(EMAIL_SERVICE_TOKEN) private emailService: EmailService
  ) {}
}
```

### Conditional Dependencies

```tsx
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger,
    @Optional() @Inject() private cache?: CacheService
  ) {}

  async getUser(id: number) {
    // Use logger if available
    this.logger?.info('Getting user', { id });

    // Use cache if available
    if (this.cache) {
      const cached = await this.cache.get(`user:${id}`);
      if (cached) return cached;
    }

    // Get from repository
    const user = await this.userRepo.findById(id);

    // Cache if available
    if (this.cache) {
      await this.cache.set(`user:${id}`, user);
    }

    return user;
  }
}
```

## 🔍 Troubleshooting

### Common Issues

**Service not injectable:**

```tsx
// Make sure to use @Service decorator
@Service() // Don't forget this!
class UserService {}
```

**Dependency not found:**

```tsx
// Make sure dependency is registered
container.set('userService', () => new UserService());
container.set('userRepository', () => new UserRepository());

// And use @Inject decorator
class UserService {
  constructor(@Inject() private userRepo: UserRepository) {}
}
```

**Optional dependency issues:**

```tsx
// Use @Optional for optional dependencies
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger // Optional
  ) {}
}
```

## 🎯 Next Steps

Ready to explore more decorator features?

- **[Container Methods](/docs/api-reference/container)** - Learn about container operations
- **[Dynamic Modules](/docs/api-reference/dynamic-module)** - Master dynamic module creation
- **[Guards](/docs/api-reference/guards)** - Use type checking utilities
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with a specific decorator?** Check out the [Container Methods](/docs/api-reference/container) reference for how to use decorators with the container! 🚀
