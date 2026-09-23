---
sidebar_position: 1
title: 'Module System'
description: 'Learn how to organize your services into modules for better structure, reusability, and maintainability. Master the art of modular architecture with NexusDI.'
tags: ['modules', 'architecture', 'organization', 'reusability']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 📦 Module System

Welcome to the module system! Think of modules as the organizational structure of your application - like different departments in a large corporation, each module has its own responsibilities and services. Just as the Enterprise has engineering, medical, and command departments, your application can have user, payment, and notification modules.

## 🎯 What are Modules?

Modules are logical groupings of related services, providers, and configuration. They help you organize your code, make it more maintainable, and enable reusability across different parts of your application.

```text
import { Module, Service } from 'nexusdi-core';

@Module({
  providers: [UserService, UserRepository, UserController],
  exports: [UserService],
})
class UserModule {
  // This module contains all user-related services
}
```

## 🏗️ Basic Module Structure

Every module follows a consistent structure:

```text
import { Module, Service, Inject } from 'nexusdi-core';

// 1. Define your services
@Service()
class DatabaseService {
  async connect() {
    console.log('Database connected');
  }
}

@Service()
class UserRepository {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async findUser(id: number) {
    await this.db.connect();
    return { id, name: 'Luke Skywalker' };
  }
}

@Service()
class UserService {
  constructor(@Inject(UserRepository) private userRepo: UserRepository) {}

  async getUser(id: number) {
    return await this.userRepo.findUser(id);
  }
}

// 2. Create your module
@Module({
  providers: [DatabaseService, UserRepository, UserService],
  exports: [UserService], // Only export what other modules need
})
class UserModule {}
```

## 🔧 Module Configuration

Modules can be configured with several options:

### Providers

Services that belong to this module:

```text
@Module({
  providers: [UserService, UserRepository, UserController, EmailService],
})
class UserModule {}
```

### Exports

Services that other modules can use:

```text
@Module({
  providers: [UserService, UserRepository, DatabaseService],
  exports: [UserService], // Only UserService is available to other modules
})
class UserModule {}
```

### Imports

Other modules that this module depends on:

```text
@Module({
  providers: [UserService],
  imports: [DatabaseModule, EmailModule],
})
class UserModule {}
```

## 🏢 Real-World Module Example

Let's build a complete e-commerce module system:

```text
import { Module, Service, Inject } from 'nexusdi-core';

// Database Module
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

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
class DatabaseModule {}

// User Module
@Service()
class UserRepository {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async findById(id: number) {
    return await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

@Service()
class UserService {
  constructor(@Inject(UserRepository) private userRepo: UserRepository) {}

  async getUser(id: number) {
    return await this.userRepo.findById(id);
  }
}

@Module({
  providers: [UserRepository, UserService],
  exports: [UserService],
  imports: [DatabaseModule],
})
class UserModule {}

// Product Module
@Service()
class ProductRepository {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async findById(id: number) {
    return await this.db.query(`SELECT * FROM products WHERE id = ${id}`);
  }
}

@Service()
class ProductService {
  constructor(@Inject(ProductRepository) private productRepo: ProductRepository) {}

  async getProduct(id: number) {
    return await this.productRepo.findById(id);
  }
}

@Module({
  providers: [ProductRepository, ProductService],
  exports: [ProductService],
  imports: [DatabaseModule],
})
class ProductModule {}

// Order Module
@Service()
class OrderRepository {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async create(orderData: any) {
    return await this.db.query(`INSERT INTO orders ...`);
  }
}

@Service()
class OrderService {
  constructor(
    @Inject(OrderRepository) private orderRepo: OrderRepository,
    @Inject(UserService) private userService: UserService,
    @Inject(ProductService) private productService: ProductService
  ) {}

  async createOrder(userId: number, productId: number) {
    const user = await this.userService.getUser(userId);
    const product = await this.productService.getProduct(productId);

    return await this.orderRepo.create({
      userId: user.id,
      productId: product.id,
      total: product.price,
    });
  }
}

@Module({
  providers: [OrderRepository, OrderService],
  exports: [OrderService],
  imports: [DatabaseModule, UserModule, ProductModule],
})
class OrderModule {}
```

## 🔄 Dynamic Modules

Sometimes you need to create modules at runtime with different configurations. Dynamic modules give you this flexibility:

```text
import { createModuleConfig } from 'nexusdi-core';

// Create a module configuration
const userModuleConfig = createModuleConfig({
  providers: [UserService, UserRepository],
  imports: [DatabaseModule],
  exports: [UserService],
});

// Register the dynamic module
await container.set(userModuleConfig);
```

### Environment-Specific Modules

```text
// Development module
const devModule = createModuleConfig({
  providers: [MockUserService, MockDatabaseService],
  exports: [MockUserService],
});

// Production module
const prodModule = createModuleConfig({
  providers: [UserService, DatabaseService],
  exports: [UserService],
});

// Choose module based on environment
const moduleConfig =
  process.env.NODE_ENV === 'production' ? prodModule : devModule;
await container.set(moduleConfig);
```

## 🏗️ Module Patterns

### 1. Feature Modules

Group services by feature:

```text
@Module({
  providers: [UserService, UserController, UserRepository],
  exports: [UserService],
})
class UserFeatureModule {}

@Module({
  providers: [ProductService, ProductController, ProductRepository],
  exports: [ProductService],
})
class ProductFeatureModule {}
```

### 2. Shared Modules

Common services used across features:

```text
@Module({
  providers: [DatabaseService, LoggerService, ConfigService],
  exports: [DatabaseService, LoggerService, ConfigService],
})
class SharedModule {}
```

### 3. Core Modules

Essential application services:

```text
@Module({
  providers: [AppService, HealthCheckService],
  exports: [AppService],
})
class CoreModule {}
```

## 🔧 Module Lifecycle

Modules follow a predictable lifecycle:

### 1. Registration

```text
// Module is registered but not yet instantiated
await container.set(UserModule);
```

### 2. Instantiation

```text
// Module is created when first accessed
const userModule = await container.get(UserModule);
```

### 3. Service Resolution

```text
// Services within the module are resolved as needed
const userService = await container.get(UserService);
```

### 4. Disposal

```text
// Module and its services are cleaned up
await container.dispose();
```

## 🎯 Best Practices

### 1. Keep Modules Focused

```text
// Good - focused on user functionality
@Module({
  providers: [UserService, UserRepository, UserController],
  exports: [UserService],
})
class UserModule {}

// Bad - mixing unrelated concerns
@Module({
  providers: [UserService, ProductService, EmailService, PaymentService],
  exports: [UserService, ProductService, EmailService, PaymentService],
})
class EverythingModule {}
```

### 2. Export Only What's Needed

```text
@Module({
  providers: [UserService, UserRepository, UserController, DatabaseService],
  exports: [UserService], // Only export what other modules need
})
class UserModule {}
```

### 3. Use Clear Module Names

```text
// Good - clear and descriptive
class UserManagementModule {}
class PaymentProcessingModule {}
class NotificationModule {}

// Bad - vague and unclear
class Module1 {}
class ServicesModule {}
class StuffModule {}
```

### 4. Organize by Domain

```text
// Group related modules in directories
modules/
├── user/
│   ├── UserModule.ts
│   ├── UserService.ts
│   └── UserRepository.ts
├── product/
│   ├── ProductModule.ts
│   ├── ProductService.ts
│   └── ProductRepository.ts
└── shared/
    ├── DatabaseModule.ts
    └── LoggerModule.ts
```

## 🚀 Advanced Module Patterns

### Lazy Loading Modules

```text
// Load modules only when needed
const loadUserModule = async () => {
  const { UserModule } = await import('./modules/user/UserModule');
  return UserModule;
};

await container.set(loadUserModule());
```

### Conditional Module Loading

```text
// Load different modules based on configuration
const createModule = (config: AppConfig) => {
  if (config.useMockServices) {
    return MockUserModule;
  }
  return UserModule;
};

await container.set(createModule(appConfig));
```

## 🔍 Troubleshooting

### Common Issues

**Module not found:**

```text
// Make sure the module is registered
await container.set(UserModule);
```

**Circular dependencies:**

```text
// Avoid modules depending on each other
// Use shared modules instead
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
class SharedModule {}
```

**Services not available:**

```text
// Make sure services are exported from the module
@Module({
  providers: [UserService],
  exports: [UserService], // Don't forget to export!
})
class UserModule {}
```

## 🎯 Next Steps

Ready to dive deeper into modules?

- **[Module Basics](/docs/modules/module-basics)** - Learn the fundamentals
- **[Module Patterns](/docs/modules/module-patterns)** - Discover common patterns
- **[Dynamic Modules](/docs/modules/dynamic-modules)** - Master runtime module creation
- **[Advanced Patterns](/docs/advanced)** - Explore advanced module techniques

---

**Ready to organize your code like a pro?** Let's explore [Module Basics](/docs/modules/module-basics) to see how to structure your modules effectively! 🚀
