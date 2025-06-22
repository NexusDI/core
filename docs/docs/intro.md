---
sidebar_position: 1
---

# Welcome to NexusDI

NexusDI is a powerful, lightweight, and ergonomic dependency injection (DI) container for TypeScript and JavaScript. It helps you manage dependencies in your applications with minimal boilerplate and maximum flexibility.

## Why NexusDI?

- **Simple API:** Register and resolve services, values, and modules with a clean, intuitive interface.
- **Type-safe:** Built for TypeScript, with full type inference and safety.
- **Modular:** Organize your code with modules and dynamic configuration.
- **Decorator Support:** Use decorators for services, providers, and injection.
- **Testable:** Easily mock or override dependencies for testing.

## Quick Start

Install NexusDI:

```bash
npm install @nexusdi/core
```

Register and resolve a service:

```typescript
import { Nexus, Service, Token } from '@nexusdi/core';

const USER_SERVICE = new Token('UserService');

@Service()
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie'];
  }
}

const container = new Nexus();
container.set(USER_SERVICE, UserService);

const userService = container.get(USER_SERVICE);
console.log(userService.getUsers()); // ['Alice', 'Bob', 'Charlie']
```

Explore the rest of the documentation to learn about modules, advanced features, and best practices!
