---
sidebar_position: 1
title: 'Getting Started with NexusDI'
description: 'Learn how to set up and use NexusDI, the modern dependency injection container for TypeScript. Get up and running in minutes with our comprehensive guide.'
tags: ['getting-started', 'tutorial', 'dependency-injection']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# ⚡ Getting Started with NexusDI

Welcome to NexusDI! You're about to discover the power of modern dependency injection in TypeScript. Think of NexusDI as your personal assistant for managing dependencies - it knows exactly what your classes need and delivers them right when you need them, like a well-oiled machine from the Star Wars universe.

## 🚀 What is NexusDI?

NexusDI is a lightweight, type-safe dependency injection container built specifically for TypeScript. It leverages native decorators and modern JavaScript features to provide a clean, intuitive API for managing your application's dependencies.

```text
import { Nexus, Service, Inject } from 'nexusdi-core';

@Service()
class UserService {
  async getUsers() {
    return ['Luke', 'Leia', 'Han'];
  }
}

@Service()
class UserController {
  constructor(@Inject(UserService) private userService: UserService) {}

  async handleRequest() {
    return await this.userService.getUsers();
  }
}

// Set up your container
const container = new Nexus();
await container.init();

// Register your services using uninstantiated classes
await container.set(UserService);
await container.set(UserController);

// Use your services
const controller = await container.get(UserController);
const users = await controller.handleRequest();
console.log(users); // ['Luke', 'Leia', 'Han']
```

## 📦 Installation

Getting started is as simple as installing a single package:

```bash
npm install nexusdi-core
```

That's it! No additional setup required - NexusDI works out of the box with modern TypeScript.

## ⚙️ TypeScript Configuration

NexusDI uses native TypeScript decorators, so you'll need to enable them in your `tsconfig.json`:

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

**Important**: NexusDI uses native decorators, not the legacy `experimentalDecorators` option. This gives you better performance and cleaner code.

## 🎯 Your First Container

Let's create your first dependency injection container:

```tsx
import { Nexus } from 'nexusdi-core';

// Create a new container
const container = new Nexus();

// Initialize the container
await container.init();

// You're ready to go!
```

The container is your central hub for managing dependencies. It's like the control room of a spaceship - everything flows through it.

## 🔧 Basic Usage Patterns

### Registering Services

There are several ways to register services with your container:

```text
// 1. Register a class constructor (uninstantiated)
await container.set(UserService);

// 2. Register a value with a token
const API_KEY_TOKEN = new Token<string>('ApiKey');
await container.set(API_KEY_TOKEN, { useValue: 'your-api-key-here' });

// 3. Register multiple services at once
await container.setMany(UserService, EmailService, {
  token: CONFIG_TOKEN,
  useValue: { apiUrl: 'https://api.example.com' }
});
```

### Retrieving Services

Getting services from your container is straightforward:

```text
// Get a service by class
const userService = await container.get(UserService);

// Get a service by token
const userService = await container.get(USER_SERVICE_TOKEN);
```

### Using Decorators

NexusDI provides decorators to make dependency injection even cleaner:

```text
import { Service, Inject, Module, Token } from 'nexusdi-core';

@Service()
class DatabaseService {
  async connect() {
    return 'Connected to database';
  }
}

@Service()
class UserRepository {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async findUser(id: string) {
    await this.db.connect();
    return { id, name: 'Luke Skywalker' };
  }
}

@Module({
  providers: [DatabaseService, UserRepository],
})
class UserModule {
  // Module configuration
}
```

## 🏗️ Real-World Example

Let's build a simple user management system:

```text
import { Nexus, Service, Inject, Module, Token } from 'nexusdi-core';

// Database service
@Service()
class DatabaseService {
  private connected = false;

  async connect() {
    this.connected = true;
    console.log('Database connected');
  }

  async query(sql: string) {
    if (!this.connected) throw new Error('Database not connected');
    // Simulate database query
    return [{ id: 1, name: 'Luke Skywalker', email: 'luke@rebellion.com' }];
  }
}

// User repository
@Service()
class UserRepository {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async findById(id: number) {
    const result = await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    return result[0];
  }

  async findAll() {
    return await this.db.query('SELECT * FROM users');
  }
}

// User service
@Service()
class UserService {
  constructor(@Inject(UserRepository) private userRepo: UserRepository) {}

  async getUser(id: number) {
    return await this.userRepo.findById(id);
  }

  async getAllUsers() {
    return await this.userRepo.findAll();
  }
}

// API controller
@Service()
class UserController {
  constructor(@Inject(UserService) private userService: UserService) {}

  async handleGetUser(id: number) {
    try {
      const user = await this.userService.getUser(id);
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Module configuration
@Module({
  providers: [DatabaseService, UserRepository, UserService, UserController],
})
class UserModule {}

// Application setup
async function bootstrap() {
  const container = new Nexus();
  await container.init();

  // Register the module
  await container.set(UserModule);

  // Get the controller
  const controller = await container.get(UserController);

  // Use the controller
  const result = await controller.handleGetUser(1);
  console.log(result);
}

bootstrap();
```

## 🔍 What's Next?

Now that you've got the basics down, here are some next steps:

- **[Core Concepts](/docs/concepts)** - Dive deeper into dependency injection principles
- **[Container API](/docs/container/nexus-class)** - Explore the full container API
- **[Modules](/docs/modules/module-basics)** - Learn about module organization
- **[Advanced Patterns](/docs/advanced)** - Discover advanced usage patterns
- **[Best Practices](/docs/best-practices)** - Follow proven patterns and practices

## 🆘 Need Help?

- Check out our [FAQ](/docs/faq) for common questions
- Browse the [API Reference](/docs/container/api-reference) for detailed documentation
- Join our community discussions on GitHub

---

**Ready to build something amazing?** Let's explore the [core concepts](/docs/concepts) to understand how NexusDI works under the hood! 🚀
