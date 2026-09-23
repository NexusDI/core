---
sidebar_position: 3
title: 'Native Decorators Support'
description: 'Learn about NexusDI native decorator support. Understand how to use modern TypeScript decorators without experimental flags.'
tags:
  ['native-decorators', 'typescript', 'decorators', 'modern', 'experimental']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🎭 Native Decorators Support

Welcome to the future of TypeScript decorators! NexusDI leverages native decorator support, which means you get better performance, cleaner code, and access to the latest TypeScript features. Think of it as upgrading from a basic lightsaber to a fully customized, high-performance weapon - the difference is night and day.

## 🎯 What are Native Decorators?

Native decorators are the modern, standardized way to use decorators in TypeScript. They provide:

- **Better Performance** - No runtime overhead from experimental features
- **Cleaner Code** - No need for `experimentalDecorators` flag
- **Future-Proof** - Built on the official decorator proposal
- **Type Safety** - Full TypeScript support
- **Standard Compliance** - Follows TC39 decorator specification

## ⚙️ TypeScript Configuration

### Required Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

**Important Notes:**

- `experimentalDecorators: false` - We use native decorators
- `emitDecoratorMetadata: false` - Not needed with native decorators
- `useDefineForClassFields: true` - Required for proper field initialization

### What This Means

```tsx
// ✅ This works with native decorators
@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;

  constructor() {
    // Fields are properly initialized
  }
}

// ❌ This won't work with experimental decorators
// (and you don't need it with native decorators)
```

## 🚀 Using Native Decorators

### Basic Service Decorator

```tsx
import { Service, Inject } from 'nexusdi-core';

@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;

  async getUser(id: number) {
    return await this.userRepo.findById(id);
  }
}
```

### Constructor Injection

```tsx
@Service()
class UserController {
  constructor(
    @Inject() private userService: UserService,
    @Inject() private emailService: EmailService,
    @Inject() private logger: Logger
  ) {}

  async handleRequest(userId: number) {
    const user = await this.userService.getUser(userId);
    await this.emailService.sendWelcomeEmail(user.email);
    this.logger.info('User processed', { userId });
    return user;
  }
}
```

### Module Configuration

```tsx
@Module({
  providers: [UserService, UserRepository, UserController],
  exports: [UserService],
})
class UserModule {}
```

## 🔧 Advanced Native Decorator Patterns

### Custom Token Injection

```tsx
import { Service, Inject, Token } from 'nexusdi-core';

const DATABASE_CONFIG_TOKEN = new Token<DatabaseConfig>('DatabaseConfig');
const CACHE_SERVICE_TOKEN = new Token<CacheService>('CacheService');

@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject(DATABASE_CONFIG_TOKEN) private dbConfig: DatabaseConfig,
    @Inject(CACHE_SERVICE_TOKEN) private cache: CacheService
  ) {}

  async getUser(id: number) {
    // Use injected dependencies
    const cacheKey = `user:${id}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findById(id);
    await this.cache.set(cacheKey, user);
    return user;
  }
}
```

### Optional Dependencies

```tsx
import { Service, Inject, Optional } from 'nexusdi-core';

@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger,
    @Optional() @Inject() private metrics?: MetricsService
  ) {}

  async getUser(id: number) {
    this.logger?.info('Getting user', { id });

    const startTime = this.metrics ? Date.now() : 0;
    const user = await this.userRepo.findById(id);

    if (this.metrics) {
      const duration = Date.now() - startTime;
      this.metrics.record('user.get.duration', duration);
    }

    return user;
  }
}
```

### Dynamic Module with Native Decorators

```tsx
import { Module, Service, createModuleConfig } from 'nexusdi-core';

@Service()
class DatabaseService {
  constructor(@Inject() private config: DatabaseConfig) {}
}

@Service()
class UserService {
  constructor(@Inject() private db: DatabaseService) {}
}

@Module({
  providers: [DatabaseService, UserService],
  exports: [UserService],
})
class UserModule {}

// Create dynamic module
const moduleConfig = createModuleConfig({
  providers: [DatabaseService, UserService],
  exports: [UserService],
});
```

## 🏗️ Real-World Examples

### Complete Application with Native Decorators

```tsx
import { Nexus, Service, Inject, Module, Optional } from 'nexusdi-core';

// Configuration
interface AppConfig {
  databaseUrl: string;
  apiKey: string;
  enableLogging: boolean;
}

const APP_CONFIG_TOKEN = new Token<AppConfig>('AppConfig');

// Database Service
@Service()
class DatabaseService implements AsyncDisposable {
  private connection: DatabaseConnection;

  constructor(@Inject(APP_CONFIG_TOKEN) private config: AppConfig) {}

  async connect() {
    this.connection = await Database.connect(this.config.databaseUrl);
  }

  async query(sql: string) {
    return await this.connection.query(sql);
  }

  async [Symbol.asyncDispose]() {
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// Repository
@Service()
class UserRepository {
  constructor(@Inject() private db: DatabaseService) {}

  async findById(id: number) {
    const result = await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    return result[0];
  }

  async save(user: User) {
    const result = await this.db.query(
      `INSERT INTO users (name, email) VALUES ('${user.name}', '${user.email}')`
    );
    return { ...user, id: result.insertId };
  }
}

// Service
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger
  ) {}

  async getUser(id: number) {
    this.logger?.info('Getting user', { id });
    return await this.userRepo.findById(id);
  }

  async createUser(userData: CreateUserData) {
    this.logger?.info('Creating user', { userData });
    return await this.userRepo.save(userData);
  }
}

// Controller
@Service()
class UserController {
  constructor(@Inject() private userService: UserService) {}

  async handleGetUser(id: number) {
    try {
      const user = await this.userService.getUser(id);
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleCreateUser(userData: CreateUserData) {
    try {
      const user = await this.userService.createUser(userData);
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Module
@Module({
  providers: [DatabaseService, UserRepository, UserService, UserController],
  exports: [UserService, UserController],
})
class UserModule {}

// Application Bootstrap
async function bootstrap() {
  const container = new Nexus();
  await container.init();

  // Register configuration
  container.set(APP_CONFIG_TOKEN, {
    databaseUrl: process.env.DATABASE_URL || 'sqlite://memory',
    apiKey: process.env.API_KEY || 'dev-key',
    enableLogging: process.env.NODE_ENV !== 'production',
  });

  // Register module
  container.set('userModule', () => new UserModule());

  // Get services
  const userController = await container.get('userController');

  // Use services
  const result = await userController.handleGetUser(1);
  console.log('User result:', result);

  // Cleanup
  await container.dispose();
}

bootstrap().catch(console.error);
```

## 🔧 Migration from Experimental Decorators

### Before (Experimental Decorators)

```tsx
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}

// Service with experimental decorators
class UserService {
  @inject('UserRepository')
  private userRepo: UserRepository;

  constructor() {
    // Fields initialized after constructor
  }
}
```

### After (Native Decorators)

```tsx
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}

// Service with native decorators
@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;

  constructor() {
    // Fields properly initialized
  }
}
```

## 🎯 Best Practices

### 1. Use Native Decorators Consistently

```tsx
// ✅ Good - All native decorators
@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;

  @Inject()
  private emailService: EmailService;
}

// ❌ Bad - Mixing decorator types
@Service()
class UserService {
  @inject('UserRepository') // Old experimental syntax
  private userRepo: UserRepository;

  @Inject() // New native syntax
  private emailService: EmailService;
}
```

### 2. Proper TypeScript Configuration

```tsx
// ✅ Good - Correct configuration
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}

// ❌ Bad - Wrong configuration
{
  "compilerOptions": {
    "target": "ES5",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false
  }
}
```

### 3. Use Constructor Injection

```tsx
// ✅ Good - Constructor injection
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private emailService: EmailService
  ) {}
}

// ❌ Bad - Property injection
@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;

  @Inject()
  private emailService: EmailService;
}
```

### 4. Handle Optional Dependencies Properly

```tsx
// ✅ Good - Proper optional handling
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private logger?: Logger
  ) {}

  async getUser(id: number) {
    this.logger?.info('Getting user', { id });
    return await this.userRepo.findById(id);
  }
}

// ❌ Bad - No optional handling
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private logger: Logger // Will fail if not registered
  ) {}
}
```

## 🔍 Troubleshooting

### Common Issues

**Decorators not working:**

```tsx
// Check TypeScript configuration
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": true
  }
}
```

**Field initialization issues:**

```tsx
// Make sure useDefineForClassFields is true
{
  "compilerOptions": {
    "useDefineForClassFields": true
  }
}
```

**Type errors:**

```tsx
// Use proper imports
import { Service, Inject, Module } from 'nexusdi-core';

// Not
import { service, inject, module } from 'nexusdi-core';
```

## 🚀 Performance Benefits

### Native vs Experimental Decorators

```tsx
// Native decorators - better performance
@Service()
class UserService {
  @Inject()
  private userRepo: UserRepository;
}

// Experimental decorators - runtime overhead
class UserService {
  @inject('UserRepository')
  private userRepo: UserRepository;
}
```

**Benefits:**

- **Faster Compilation** - No experimental feature processing
- **Smaller Bundle** - No decorator metadata
- **Better Tree Shaking** - Cleaner code structure
- **Future-Proof** - Built on standards

## 🎯 Next Steps

Ready to explore more native decorator features?

- **[Async Patterns](/docs/advanced/async-patterns)** - Master async/await patterns
- **[Resource Cleanup](/docs/advanced/resource-cleanup)** - Learn about AsyncDisposable
- **[Performance](performance)** - Optimize your decorator usage
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with native decorators?** Check out [Async Patterns](/docs/advanced/async-patterns) to learn about proper async decorator usage! 🚀
